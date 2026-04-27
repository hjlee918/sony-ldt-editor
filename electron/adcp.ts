import { createHash } from 'crypto';
import { Socket } from 'net';
import { EventEmitter } from 'events';

export type ErrorCode = 'err_auth' | 'err_connect' | 'err_cmd' | 'err_val' | 'err_inactive' | 'err_timeout';

export interface ProjectorStatus {
  connected: boolean;
  ip?: string;
  // ── Lite (always fetched) ──
  calibPreset: number;
  contrast: number;
  brightness: number;
  colorTemp: number;
  gammaCorrection: number;
  colorSpace: number;
  advancedIris: number;
  motionflow: number;
  nr: number;
  aspect: number;
  hdr?: number;
  inputSelect?: number;
  // ── Full only ──
  color?: number;
  hue?: number;
  sharpness?: number;
  contrastEnhancer?: number;
  lampControl?: number;
  realityCreation?: number;
  mpegNr?: number;
  smoothGradation?: number;
  filmMode?: number;
  inputLagReduction?: number;
  clearWhite?: number;
  xvColor?: number;
  csRCyanRed?: number;  csGCyanRed?: number;  csBCyanRed?: number;
  csRMagGreen?: number; csGMagGreen?: number; csBMagGreen?: number;
  ctGainR?: number; ctGainG?: number; ctGainB?: number;
  ctBiasR?: number; ctBiasG?: number; ctBiasB?: number;
  ccRHue?: number; ccRSat?: number; ccRBri?: number;
  ccYHue?: number; ccYSat?: number; ccYBri?: number;
  ccGHue?: number; ccGSat?: number; ccGBri?: number;
  ccCHue?: number; ccCSat?: number; ccCBri?: number;
  ccBHue?: number; ccBSat?: number; ccBBri?: number;
  ccMHue?: number; ccMSat?: number; ccMBri?: number;
  blankLeft?: number; blankRight?: number; blankTop?: number; blankBottom?: number;
  dynamicRangeH1?: number; hdmiFormatH1?: number;
  dynamicRangeH2?: number; hdmiFormatH2?: number;
  d3Display?: number; d3Format?: number; d3Brightness?: number;
  testPattern?: number;
  altitudeMode?: number; remoteStart?: number; networkMgmt?: number; powerSaving?: number;
  lensControl?: number;
  irReceiver?: number;   // 0=Front+Rear, 1=Front, 2=Rear (replaces irFront/irRear)
  imageFlip?: number;
  irisAperture?: number;
  blankingEnabled?: number; // 0=off, 1=on
  lampTimer?: number;
  signalType?: string;
  colorFormat?: string;  // e.g. "YCbCr444", "RGB" — probed from undocumented commands; null if unsupported
  modelName?: string;
  serialNo?: string;
  softwareVersion?: string;
}

const ADCP_PORT = 53595;

/** SDCP unsigned (0x8000-centred) → signed integer for ADCP numeric commands. */
function sdcpToSigned(v: number): number {
  return v > 0x7fff ? v - 0x10000 : v;
}

/** Signed integer from ADCP → SDCP unsigned (0x8000-centred) for status storage. */
function signedToSdcp(v: number): number {
  return v < 0 ? v + 0x10000 : v;
}

export class AdcpConnection extends EventEmitter {
  private socket: Socket | null = null;
  private _ip = '';
  private _password = '';
  private lineBuffer = '';
  private pendingLines: Array<{
    resolve: (line: string) => void;
    reject: (err: Error) => void;
  }> = [];

  /** Promise-chain mutex — serialises all ADCP operations so commands never interleave. */
  private _opChain: Promise<unknown> = Promise.resolve();
  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const p = this._opChain.then(() => fn());
    this._opChain = p.then(() => {}, () => {});
    return p;
  }

  // ── Connection ────────────────────────────────────────────────────────────

  async connect(ip: string, password?: string): Promise<'ok' | ErrorCode> {
    this._ip = ip;
    this._password = password ?? '';
    return new Promise((resolve) => {
      const sock = new Socket();

      sock.on('connect', () => {
        this.socket = sock;
        sock.on('data',  (d: Buffer) => this.onData(d));
        sock.on('error', (err: Error) => this.onSocketError(err));

        // ADCP sends a greeting on connect: "NOKEY\r\n" (no auth) or "PJKEY …\r\n" (SHA-256).
        this.readLine(5000)
          .then((line) => {
            if (line.startsWith('NOKEY')) {
              resolve('ok');
            } else {
              // SHA-256 challenge or unknown — not implemented; disconnect cleanly.
              sock.destroy();
              this.socket = null;
              resolve('err_auth');
            }
          })
          .catch(() => {
            // No greeting within 5 s — some firmware versions skip it; try anyway.
            resolve('ok');
          });
      });

      sock.on('error', () => resolve('err_connect'));
      sock.connect(ADCP_PORT, ip);
    });
  }

  async disconnect(): Promise<void> {
    this.socket?.destroy();
    this.socket = null;
    this.lineBuffer = '';
    const pending = this.pendingLines.splice(0);
    for (const p of pending) p.reject(new Error('err_connect'));
  }

  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  // ── Low-level I/O ─────────────────────────────────────────────────────────

  private readLine(timeoutMs = 1500): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.pendingLines.findIndex((p) => p.reject === reject);
        if (idx !== -1) this.pendingLines.splice(idx, 1);
        reject(new Error('err_timeout'));
      }, timeoutMs);
      this.pendingLines.push({
        resolve: (line) => { clearTimeout(timer); resolve(line); },
        reject:  (err)  => { clearTimeout(timer); reject(err); },
      });
    });
  }

  private onData(data: Buffer): void {
    this.lineBuffer += data.toString('utf8');
    let idx: number;
    while ((idx = this.lineBuffer.indexOf('\n')) !== -1) {
      const line = this.lineBuffer.slice(0, idx).replace(/\r$/, '');
      this.lineBuffer = this.lineBuffer.slice(idx + 1);
      const pending = this.pendingLines.shift();
      if (pending) pending.resolve(line);
    }
  }

  private onSocketError(_err: Error): void {
    const pending = this.pendingLines.splice(0);
    for (const p of pending) p.reject(new Error('err_connect'));
    this.socket = null;
  }

  /** Send one ADCP text command and return the single response line. */
  private async sendCmd(cmd: string): Promise<string> {
    if (!this.socket || this.socket.destroyed) throw new Error('err_connect');
    this.socket.write(cmd + '\r\n');
    return this.readLine();
  }

  /** Send a SET command; returns 'ok' or an error code. */
  private async sendSet(cmd: string): Promise<'ok' | ErrorCode> {
    try {
      const resp = await this.sendCmd(cmd);
      if (resp === 'ok') return 'ok';
      if (resp.startsWith('err_')) return resp as ErrorCode;
      return 'ok'; // unexpected but non-error response
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'err_cmd';
      return (msg as ErrorCode) || 'err_cmd';
    }
  }

  /** Send a query command; returns the raw response line or null on any error. */
  private async sendQuery(cmd: string): Promise<string | null> {
    try {
      const resp = await this.sendCmd(cmd);
      if (resp.startsWith('err_') || resp === 'ok') return null;
      return resp;
    } catch {
      return null;
    }
  }

  /** Strip surrounding double-quotes from an ADCP string response. */
  private static unquote(s: string | null): string | null {
    if (!s) return null;
    const m = s.match(/^"(.*)"$/);
    return m ? m[1] : s;
  }

  // ── Typed query helpers ───────────────────────────────────────────────────

  /** Query a menu_sel command; returns the unquoted string value, or null. */
  private async qSel(cmd: string, suffix?: string): Promise<string | null> {
    const q = suffix ? `${cmd} --${suffix} ?` : `${cmd} ?`;
    return AdcpConnection.unquote(await this.sendQuery(q));
  }

  /** Query a menu_num command; returns a parsed integer, or null. */
  private async qNum(cmd: string, suffix?: string): Promise<number | null> {
    const q = suffix ? `${cmd} --${suffix} ?` : `${cmd} ?`;
    const r = await this.sendQuery(q);
    if (!r) return null;
    const n = parseInt(r, 10);
    return isNaN(n) ? null : n;
  }

  /**
   * Query a menu_sel command and map the string to a number via a lookup table.
   * Returns undefined when the projector doesn't recognise the command (g_opt semantics).
   */
  private async qSelMap(
    cmd: string,
    map: Record<string, number>,
    suffix?: string,
  ): Promise<number | undefined> {
    const s = await this.qSel(cmd, suffix);
    if (s === null) return undefined;
    const n = map[s];
    return n !== undefined ? n : undefined;
  }

  /** Like qSelMap but falls back to `def` instead of undefined. */
  private async qSelMapDef(
    cmd: string,
    map: Record<string, number>,
    def: number,
    suffix?: string,
  ): Promise<number> {
    return (await this.qSelMap(cmd, map, suffix)) ?? def;
  }

  /** Like qNum but falls back to `def` instead of null. */
  private async qNumDef(cmd: string, def: number, suffix?: string): Promise<number> {
    return (await this.qNum(cmd, suffix)) ?? def;
  }

  /**
   * Query a signed ADCP numeric value and convert to SDCP unsigned (0x8000-centred).
   * Returns undefined when the command is not recognised.
   */
  private async qNumSigned(cmd: string, suffix?: string): Promise<number | undefined> {
    const n = await this.qNum(cmd, suffix);
    return n === null ? undefined : signedToSdcp(n);
  }

  // ── SET command mapping ───────────────────────────────────────────────────

  /**
   * Maps a binary SDCP (upper, lower, value) triple to an ADCP text command.
   * Returns null for items with no confirmed ADCP equivalent (treated as no-op).
   */
  private buildSetCmd(upper: number, lower: number, value: number): string | null {
    const code = (upper << 8) | lower;
    switch (code) {

      // ── Power / Input ──────────────────────────────────────────────────────
      case 0x0130: return `power "${value === 1 ? 'on' : 'off'}"`;
      case 0x0003: return `input "${value === 1 ? 'hdmi1' : 'hdmi2'}"`;

      // ── Calib Preset ───────────────────────────────────────────────────────
      case 0x0002: {
        const m = ['cinema_film1','cinema_film2','reference','tv','photo','game','brt_cinema','brt_tv','user'];
        return `picture_mode "${m[value] ?? 'reference'}"`;
      }
      case 0x0000: return `picture_mode_reset`;

      // ── Tone ───────────────────────────────────────────────────────────────
      case 0x0011: return `contrast ${value}`;
      case 0x0010: return `brightness ${value}`;
      case 0x0012: return `color ${value}`;
      case 0x0013: return `hue ${value}`;
      case 0x0024: return `sharpness ${value}`;

      // ── Color Temperature ──────────────────────────────────────────────────
      case 0x0017: {
        const m: Record<number, string> = {
          0:'d93', 1:'d75', 2:'d65', 3:'custom1', 4:'custom2',
          5:'custom3', 6:'custom4', 7:'custom5', 9:'d55',
        };
        return `color_temp "${m[value] ?? 'd65'}"`;
      }
      case 0x0030: return `coltemp_gain_r ${value}`;
      case 0x0031: return `coltemp_gain_g ${value}`;
      case 0x0032: return `coltemp_gain_b ${value}`;
      case 0x0033: return `coltemp_bias_r ${value}`;
      case 0x0034: return `coltemp_bias_g ${value}`;
      case 0x0035: return `coltemp_bias_b ${value}`;

      // ── Cinema Black Pro ───────────────────────────────────────────────────
      case 0x001d: {
        // SDCP: 0=Off, 2=Full, 3=Limited
        const m: Record<number, string> = { 0: 'off', 2: 'full', 3: 'limited' };
        return `iris_dyn_cont "${m[value] ?? 'off'}"`;
      }
      case 0x001e: {
        const m = ['off', 'low', 'mid', 'high'];
        return `contrast_enh "${m[value] ?? 'off'}"`;
      }
      case 0x001f: return `lamp_control "${value === 0 ? 'low' : 'high'}"`;

      // ── Processing ─────────────────────────────────────────────────────────
      case 0x0059: {
        const m = ['off', 'smooth_high', 'smooth_low', 'impulse', 'combination', 'true_cinema'];
        return `motionflow "${m[value] ?? 'off'}"`;
      }
      case 0x0020: return `real_cre "${value === 1 ? 'on' : 'off'}"`;

      // ── Expert: Noise ──────────────────────────────────────────────────────
      case 0x0025: {
        const m = ['off', 'low', 'mid', 'high', 'auto'];
        return `nr "${m[value] ?? 'off'}"`;
      }
      case 0x0026: {
        const m = ['off', 'low', 'mid', 'high', 'auto'];
        return `mnr "${m[value] ?? 'off'}"`;
      }
      case 0x0027: {
        const m = ['off', 'low', 'mid', 'high'];
        return `smooth_grd "${m[value] ?? 'off'}"`;
      }
      case 0x0023: return `film_mode "${value === 0 ? 'auto' : 'off'}"`;

      // ── Expert: Gamma & HDR ────────────────────────────────────────────────
      case 0x0022: {
        if (value >= 7 && value <= 10) return `gamma_correction "gamma${value}"`;
        const m: Record<number, string> = {
          0: 'off', 1: '1.8', 2: '2.0', 3: '2.1', 4: '2.2', 5: '2.4', 6: '2.6',
        };
        return `gamma_correction "${m[value] ?? 'off'}"`;
      }
      case 0x007c: {
        // SDCP: 0=Off, 1=HDR10, 2=Auto, 3=HLG
        const m: Record<number, string> = { 0: 'off', 1: 'hdr10', 2: 'auto', 3: 'hlg' };
        return `hdr "${m[value] ?? 'off'}"`;
      }
      case 0x0099: return `input_lag_red "${value === 1 ? 'on' : 'off'}"`;
      case 0x0028: {
        const m = ['off', 'low', 'high'];
        return `clear_white "${m[value] ?? 'off'}"`;
      }
      case 0x0029: return `xvcolor "${value === 1 ? 'on' : 'off'}"`;

      // ── Color Space ────────────────────────────────────────────────────────
      case 0x003b: {
        // SDCP: 0=BT.709, 3=CS1, 4=CS2, 5=CS3, 6=Custom, 8=BT.2020
        const m: Record<number, string> = {
          0: 'bt709', 3: 'color_space1', 4: 'color_space2',
          5: 'color_space3', 6: 'custom', 8: 'bt2020',
        };
        return `color_space "${m[value] ?? 'bt709'}"`;
      }
      // Color Space per-channel Cyan-Red (X) and Magenta-Green (Y) — suffix before value
      case 0x0076: return `col_space_x --r ${sdcpToSigned(value)}`;
      case 0x0077: return `col_space_y --r ${sdcpToSigned(value)}`;
      case 0x00a1: return `col_space_x --g ${sdcpToSigned(value)}`;
      case 0x00a2: return `col_space_x --b ${sdcpToSigned(value)}`;
      case 0x00a3: return `col_space_y --g ${sdcpToSigned(value)}`;
      case 0x00a4: return `col_space_y --b ${sdcpToSigned(value)}`;

      // ── Color Correction ───────────────────────────────────────────────────
      case 0x0087: return `col_corr_hue --r ${sdcpToSigned(value)}`;
      case 0x0088: return `col_corr_color --r ${sdcpToSigned(value)}`;
      case 0x0089: return `col_corr_brt --r ${sdcpToSigned(value)}`;
      case 0x008a: return `col_corr_hue --y ${sdcpToSigned(value)}`;
      case 0x008b: return `col_corr_color --y ${sdcpToSigned(value)}`;
      case 0x008c: return `col_corr_brt --y ${sdcpToSigned(value)}`;
      case 0x008d: return `col_corr_hue --g ${sdcpToSigned(value)}`;
      case 0x008e: return `col_corr_color --g ${sdcpToSigned(value)}`;
      case 0x008f: return `col_corr_brt --g ${sdcpToSigned(value)}`;
      case 0x0090: return `col_corr_hue --c ${sdcpToSigned(value)}`;
      case 0x0091: return `col_corr_color --c ${sdcpToSigned(value)}`;
      case 0x0092: return `col_corr_brt --c ${sdcpToSigned(value)}`;
      case 0x0093: return `col_corr_hue --b ${sdcpToSigned(value)}`;
      case 0x0094: return `col_corr_color --b ${sdcpToSigned(value)}`;
      case 0x0095: return `col_corr_brt --b ${sdcpToSigned(value)}`;
      case 0x0096: return `col_corr_hue --m ${sdcpToSigned(value)}`;
      case 0x0097: return `col_corr_color --m ${sdcpToSigned(value)}`;
      case 0x0098: return `col_corr_brt --m ${sdcpToSigned(value)}`;

      // ── Screen ─────────────────────────────────────────────────────────────
      case 0x003c: {
        const m = ['normal', 'v_stretch', 'squeeze', 'stretch', '1.85_1_zoom', '2.35_1_zoom'];
        return `aspect "${m[value] ?? 'normal'}"`;
      }
      case 0x0078: return `blanking --left ${value}`;
      case 0x0079: return `blanking --right ${value}`;
      case 0x007a: return `blanking --top ${value}`;
      case 0x007b: return `blanking --bottom ${value}`;

      // ── Function: HDMI ─────────────────────────────────────────────────────
      case 0x0060: {
        const m = ['auto', 'limited', 'full'];
        return `dynamic_range --hdmi1 "${m[value] ?? 'auto'}"`;
      }
      case 0x0061: return `hdmi_signal_format --hdmi1 "${value === 0 ? 'standard' : 'enhanced'}"`;
      case 0x006e: {
        const m = ['auto', 'limited', 'full'];
        return `dynamic_range --hdmi2 "${m[value] ?? 'auto'}"`;
      }
      case 0x006f: return `hdmi_signal_format --hdmi2 "${value === 0 ? 'standard' : 'enhanced'}"`;
      case 0x0063: return `test_pattern "${value === 1 ? 'on' : 'off'}"`;

      // ── Function: 3D ───────────────────────────────────────────────────────
      case 0x0065: {
        const m = ['auto', '3d', '2d'];
        return `2d3d_sel "${m[value] ?? 'auto'}"`;
      }
      case 0x0066: {
        const m = ['sim3d', 'sidebyside', 'overunder'];
        return `3d_format "${m[value] ?? 'sim3d'}"`;
      }
      case 0x0067: return `3d_brt "${value === 0 ? 'standard' : 'high'}"`;

      // ── Setup ──────────────────────────────────────────────────────────────
      case 0x0064: return `high_alt_mode "${value === 1 ? 'on' : 'off'}"`;
      case 0x0068: return `remote_start "${value === 1 ? 'on' : 'off'}"`;
      case 0x0069: return `network_mgmt "${value === 1 ? 'on' : 'off'}"`;
      case 0x006a: return `powsave_nosig "${value === 1 ? 'standby' : 'off'}"`;

      // ── Installation ───────────────────────────────────────────────────────
      case 0x0062: {
        const m = ['off', 'hv', 'h', 'v'];
        return `image_flip "${m[value] ?? 'off'}"`;
      }
      case 0x006b: return `lens_lock "${value === 1 ? 'on' : 'off'}"`;
      case 0x006c: {
        // 0=Front+Rear, 1=Front, 2=Rear
        const m = ['front_rear', 'front', 'rear'];
        return `ir_receiver "${m[value] ?? 'front_rear'}"`;
      }

      // ── Cinema Black Pro ───────────────────────────────────────────────────
      case 0x001a: return `iris_brightness ${value}`;

      // ── Screen: Blanking enable ────────────────────────────────────────────
      case 0x007d: return `blanking_enable "${value === 1 ? 'on' : 'off'}"`;

      // ── No confirmed ADCP equivalent (auto calibration, etc.) ─────────────
      default: return null;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async set(upper: number, lower: number, value: number): Promise<'ok' | ErrorCode> {
    return this.withLock(async () => {
      const cmd = this.buildSetCmd(upper, lower, value);
      if (!cmd) return 'ok'; // no-op for unmapped items
      return this.sendSet(cmd);
    });
  }

  async getStatus(lite = false): Promise<ProjectorStatus> {
    return this.withLock(async () => {

      // ── Reverse-lookup tables: ADCP string → SDCP numeric value ──────────
      const CALIB_MAP: Record<string, number> = {
        cinema_film1: 0, cinema_film2: 1, reference: 2, tv: 3,
        photo: 4, game: 5, brt_cinema: 6, brt_tv: 7, user: 8,
      };
      const CT_MAP: Record<string, number> = {
        d93: 0, d75: 1, d65: 2, custom1: 3, custom2: 4,
        custom3: 5, custom4: 6, custom5: 7, d55: 9,
      };
      const GAMMA_MAP: Record<string, number> = {
        off: 0, '1.8': 1, '2.0': 2, '2.1': 3, '2.2': 4, '2.4': 5, '2.6': 6,
        gamma7: 7, gamma8: 8, gamma9: 9, gamma10: 10,
      };
      const CS_MAP: Record<string, number> = {
        bt709: 0, color_space1: 3, color_space2: 4, color_space3: 5, custom: 6, bt2020: 8,
      };
      const HDR_MAP: Record<string, number>  = { off: 0, hdr10: 1, auto: 2, hlg: 3 };
      const IRIS_MAP: Record<string, number> = { off: 0, full: 2, limited: 3 };
      const MF_MAP: Record<string, number>   = {
        off: 0, smooth_high: 1, smooth_low: 2, impulse: 3, combination: 4, true_cinema: 5,
      };
      const NR_MAP: Record<string, number>   = { off: 0, low: 1, mid: 2, high: 3, auto: 4 };
      const ASP_MAP: Record<string, number>  = {
        normal: 0, v_stretch: 1, squeeze: 2, stretch: 3, '1.85_1_zoom': 4, '2.35_1_zoom': 5,
      };
      const ENH_MAP: Record<string, number>  = { off: 0, low: 1, mid: 2, high: 3 };
      const DR_MAP: Record<string, number>   = { auto: 0, limited: 1, full: 2 };
      const D3D_MAP: Record<string, number>  = { auto: 0, '3d': 1, '2d': 2 };
      const D3F_MAP: Record<string, number>  = { sim3d: 0, sidebyside: 1, overunder: 2 };
      const IR_MAP: Record<string, number>   = { front_rear: 0, front: 1, rear: 2 };
      const FLIP_MAP: Record<string, number> = { off: 0, hv: 1, h: 2, v: 3 };
      const CW_MAP: Record<string, number>   = { off: 0, low: 1, high: 2 };
      const ONOFF_MAP: Record<string, number> = { on: 1, off: 0 };
      const LOHI_MAP: Record<string, number>  = { low: 0, high: 1 };

      // ── Lite fields (always fetched) ──────────────────────────────────────
      const calibPreset     = await this.qSelMapDef('picture_mode',    CALIB_MAP, 0);
      const contrast        = await this.qNumDef('contrast',  50);
      const brightness      = await this.qNumDef('brightness', 50);
      const colorTemp       = await this.qSelMapDef('color_temp',       CT_MAP,    2);
      const gammaCorrection = await this.qSelMapDef('gamma_correction', GAMMA_MAP, 0);
      const colorSpace      = await this.qSelMapDef('color_space',      CS_MAP,    0);
      const advancedIris    = await this.qSelMapDef('iris_dyn_cont',    IRIS_MAP,  0);
      const motionflow      = await this.qSelMapDef('motionflow',       MF_MAP,    0);
      const nr              = await this.qSelMapDef('nr',               NR_MAP,    0);
      const aspect          = await this.qSelMapDef('aspect',           ASP_MAP,   0);
      const hdr             = await this.qSelMap('hdr',    HDR_MAP);
      const inputSelect     = await this.qSelMap('input',  { hdmi1: 1, hdmi2: 2 });

      // Signal info — included in lite so the pinned bar stays accurate
      const sigRaw    = await this.qSel('signal');
      const signalType = (sigRaw && sigRaw !== 'Invalid') ? sigRaw : undefined;

      // Color format — probe several undocumented candidate commands; use first that answers
      let colorFormat: string | undefined;
      for (const candidate of ['color_format', 'input_color_format', 'colorspace_info']) {
        const raw = await this.qSel(candidate);
        if (raw) { colorFormat = raw; break; }
      }

      // Blanking enable — included in lite so the toggle reflects current state
      const blankingEnabled = await this.qSelMapDef('blanking_enable', ONOFF_MAP, 0);

      if (lite) {
        return {
          connected: true,
          calibPreset, contrast, brightness, colorTemp, gammaCorrection,
          colorSpace, advancedIris, motionflow, nr, aspect, hdr, inputSelect,
          signalType, colorFormat, blankingEnabled,
        };
      }

      // ── Full fields ───────────────────────────────────────────────────────
      const color           = await this.qNumDef('color',     50);
      const hue             = await this.qNumDef('hue',       50);
      const sharpness       = await this.qNumDef('sharpness', 10);
      const contrastEnhancer = await this.qSelMapDef('contrast_enh', ENH_MAP, 0);
      const lampControl     = await this.qSelMapDef('lamp_control', LOHI_MAP, 1);
      const realityCreation = await this.qSelMapDef('real_cre', ONOFF_MAP, 1);
      const mpegNr          = await this.qSelMapDef('mnr', NR_MAP, 0);
      const smoothGradation = await this.qSelMapDef('smooth_grd', ENH_MAP, 0);
      const filmMode        = await this.qSelMapDef('film_mode', { auto: 0, off: 1 }, 0);
      const inputLagReduction = await this.qSelMapDef('input_lag_red', ONOFF_MAP, 0);
      const clearWhite      = await this.qSelMapDef('clear_white', CW_MAP, 0);
      const xvColor         = await this.qSelMapDef('xvcolor', ONOFF_MAP, 0);

      // Color Space per-channel sliders (signed ADCP ↔ SDCP-unsigned); available in all modes
      const csRCyanRed  = await this.qNumSigned('col_space_x', 'r');
      const csGCyanRed  = await this.qNumSigned('col_space_x', 'g');
      const csBCyanRed  = await this.qNumSigned('col_space_x', 'b');
      const csRMagGreen = await this.qNumSigned('col_space_y', 'r');
      const csGMagGreen = await this.qNumSigned('col_space_y', 'g');
      const csBMagGreen = await this.qNumSigned('col_space_y', 'b');

      // Color Temp Gain/Bias — signed values, range −30 to +30, neutral = 0
      // Available for all color temp presets (D93/D75/D65/D55 and Custom 1–5)
      const ctGainR = await this.qNumDef('coltemp_gain_r', 0);
      const ctGainG = await this.qNumDef('coltemp_gain_g', 0);
      const ctGainB = await this.qNumDef('coltemp_gain_b', 0);
      const ctBiasR = await this.qNumDef('coltemp_bias_r', 0);
      const ctBiasG = await this.qNumDef('coltemp_bias_g', 0);
      const ctBiasB = await this.qNumDef('coltemp_bias_b', 0);

      // Color Correction (signed ADCP values → SDCP unsigned for storage)
      const ccRHue = await this.qNumSigned('col_corr_hue',   'r');
      const ccRSat = await this.qNumSigned('col_corr_color', 'r');
      const ccRBri = await this.qNumSigned('col_corr_brt',   'r');
      const ccYHue = await this.qNumSigned('col_corr_hue',   'y');
      const ccYSat = await this.qNumSigned('col_corr_color', 'y');
      const ccYBri = await this.qNumSigned('col_corr_brt',   'y');
      const ccGHue = await this.qNumSigned('col_corr_hue',   'g');
      const ccGSat = await this.qNumSigned('col_corr_color', 'g');
      const ccGBri = await this.qNumSigned('col_corr_brt',   'g');
      const ccCHue = await this.qNumSigned('col_corr_hue',   'c');
      const ccCSat = await this.qNumSigned('col_corr_color', 'c');
      const ccCBri = await this.qNumSigned('col_corr_brt',   'c');
      const ccBHue = await this.qNumSigned('col_corr_hue',   'b');
      const ccBSat = await this.qNumSigned('col_corr_color', 'b');
      const ccBBri = await this.qNumSigned('col_corr_brt',   'b');
      const ccMHue = await this.qNumSigned('col_corr_hue',   'm');
      const ccMSat = await this.qNumSigned('col_corr_color', 'm');
      const ccMBri = await this.qNumSigned('col_corr_brt',   'm');

      // Screen — blanking uses --suffix for direction
      const blankLeft   = await this.qNumDef('blanking', 0, 'left');
      const blankRight  = await this.qNumDef('blanking', 0, 'right');
      const blankTop    = await this.qNumDef('blanking', 0, 'top');
      const blankBottom = await this.qNumDef('blanking', 0, 'bottom');

      // Function: HDMI — queries use --hdmi1/--hdmi2 suffix
      const dynamicRangeH1 = await this.qSelMap('dynamic_range',      DR_MAP,              'hdmi1');
      const hdmiFormatH1   = await this.qSelMap('hdmi_signal_format',  { standard:0, enhanced:1 }, 'hdmi1');
      const dynamicRangeH2 = await this.qSelMap('dynamic_range',      DR_MAP,              'hdmi2');
      const hdmiFormatH2   = await this.qSelMap('hdmi_signal_format',  { standard:0, enhanced:1 }, 'hdmi2');
      const testPattern    = await this.qSelMap('test_pattern', ONOFF_MAP);

      // Function: 3D
      const d3Display    = await this.qSelMap('2d3d_sel',  D3D_MAP);
      const d3Format     = await this.qSelMap('3d_format', D3F_MAP);
      const d3Brightness = await this.qSelMap('3d_brt',   { standard: 0, high: 1 });

      // Cinema Black Pro: iris brightness (aperture control under Advanced Iris)
      const irisAperture = await this.qNum('iris_brightness');

      // Projector identity & lamp hours
      const modelName = await this.qSel('modelname') ?? undefined;
      const serialNo  = await this.qSel('serialnum') ?? undefined;

      let lampTimer: number | undefined;
      const timerResp = await this.sendQuery('timer ?');
      if (timerResp) {
        try {
          const arr = JSON.parse(timerResp) as Array<Record<string, number>>;
          lampTimer = arr.find((o) => 'light_src' in o)?.light_src;
        } catch { /* ignore parse errors */ }
      }

      let softwareVersion: string | undefined;
      const verResp = await this.sendQuery('version ?');
      if (verResp) {
        try {
          const arr = JSON.parse(verResp) as Array<Record<string, string>>;
          softwareVersion = arr.find((o) => 'main' in o)?.main;
        } catch { /* ignore parse errors */ }
      }

      // Setup / Installation
      const altitudeMode = await this.qSelMapDef('high_alt_mode', ONOFF_MAP, 0);
      const imageFlip    = await this.qSelMapDef('image_flip',    FLIP_MAP,  0);
      const remoteStart  = await this.qSelMapDef('remote_start',  ONOFF_MAP, 0);
      const networkMgmt  = await this.qSelMapDef('network_mgmt',  ONOFF_MAP, 0);
      const powerSaving  = await this.qSelMapDef('powsave_nosig', { off: 0, standby: 1 }, 0);
      const lensControl  = await this.qSelMapDef('lens_lock',     ONOFF_MAP, 1);
      const irReceiver   = await this.qSelMapDef('ir_receiver',   IR_MAP,    0);

      return {
        connected: true,
        calibPreset, contrast, brightness, colorTemp, gammaCorrection,
        colorSpace, advancedIris, motionflow, nr, aspect, hdr, inputSelect,
        color, hue, sharpness, contrastEnhancer, lampControl,
        realityCreation, mpegNr, smoothGradation, filmMode,
        inputLagReduction, clearWhite, xvColor,
        csRCyanRed, csGCyanRed, csBCyanRed,
        csRMagGreen, csGMagGreen, csBMagGreen,
        ctGainR, ctGainG, ctGainB, ctBiasR, ctBiasG, ctBiasB,
        ccRHue, ccRSat, ccRBri,
        ccYHue, ccYSat, ccYBri,
        ccGHue, ccGSat, ccGBri,
        ccCHue, ccCSat, ccCBri,
        ccBHue, ccBSat, ccBBri,
        ccMHue, ccMSat, ccMBri,
        blankLeft, blankRight, blankTop, blankBottom,
        dynamicRangeH1, hdmiFormatH1, dynamicRangeH2, hdmiFormatH2,
        d3Display, d3Format, d3Brightness,
        testPattern, altitudeMode, imageFlip,
        remoteStart, networkMgmt, powerSaving, lensControl, irReceiver,
        irisAperture: irisAperture ?? undefined,
        blankingEnabled,
        signalType, colorFormat, lampTimer, modelName, serialNo, softwareVersion,
      };
    });
  }

  async activateSlot(slot: 7 | 8 | 9 | 10): Promise<'ok' | ErrorCode> {
    return this.withLock(async () => {
      return this.sendSet(`gamma_correction "gamma${slot}"`);
    });
  }

  /** Save, load (sel), or delete a picture position preset. */
  async picPos(action: 'sel' | 'save' | 'del', slot: string): Promise<'ok' | ErrorCode> {
    const cmd = action === 'sel'  ? `pic_pos_sel "${slot}"`
              : action === 'save' ? `pic_pos_save "${slot}"`
              :                     `pic_pos_del "${slot}"`;
    return this.withLock(() => this.sendSet(cmd));
  }

  /** Send a remote-controller key command (e.g. "lens_focus_far"). */
  async key(keyCode: string): Promise<'ok' | ErrorCode> {
    return this.withLock(() => this.sendSet(`key "${keyCode}"`));
  }

  // ── SDCP binary helpers (upload + download) ──────────────────────────────

  private static readonly SDCP_PREFIX = Buffer.from([
    0xa5, 0x01, 0x00, 0x01, 0x00, 0x01, 0x05, 0x00, 0x01, 0x00, 0x01,
  ]);

  private static buildSdcpFrame(innerData: Buffer): Buffer {
    const checksum = innerData.slice(1).reduce((acc, b) => acc ^ b, 0);
    const len = innerData.length + 2;
    const frame = Buffer.alloc(10 + innerData.length + 2);
    frame[0] = 0x02; frame[1] = 0x0a;
    frame.write('SONY', 2, 'ascii');
    frame[6] = 0x00; frame[7] = 0x70;
    frame[8] = (len >> 8) & 0xff; frame[9] = len & 0xff;
    innerData.copy(frame, 10);
    frame[10 + innerData.length] = checksum;
    frame[10 + innerData.length + 1] = 0x5a;
    return frame;
  }

  /** Write 16 values into a gamma slot chunk. */
  private static buildLdtWriteFrame(slot: 7|8|9|10, ch: 0|1|2, si: 0|16|32|48, values: number[]): Buffer {
    const payload = Buffer.alloc(37);
    payload[0] = slot; payload[1] = ch;
    payload.writeUInt16BE(si, 2); payload[4] = 0x10;
    for (let i = 0; i < 16; i++) payload.writeUInt16BE(values[i], 5 + i * 2);
    return AdcpConnection.buildSdcpFrame(Buffer.concat([
      AdcpConnection.SDCP_PREFIX,
      Buffer.from([0x8c, 0x00, 0x80, 0x27, 0x00, 0x25]),
      payload,
    ]));
  }

  /** Read 16 values from a gamma slot chunk. */
  private static buildLdtReadFrame(slot: 7|8|9|10, ch: 0|1|2, si: 0|16|32|48): Buffer {
    return AdcpConnection.buildSdcpFrame(Buffer.concat([
      AdcpConnection.SDCP_PREFIX,
      Buffer.from([0x8c, 0x01, 0x80, 0x07, 0x00, 0x05,
        slot, ch, (si >> 8) & 0xff, si & 0xff, 0x10]),
    ]));
  }

  private static buildActivateFrame(slot: 7|8|9|10): Buffer {
    return AdcpConnection.buildSdcpFrame(Buffer.concat([
      AdcpConnection.SDCP_PREFIX,
      Buffer.from([0x8b, 0x00, 0x80, 0x08, 0x00, 0x06, 0x00, 0x07, 0x00, slot, 0x00, 0x07]),
    ]));
  }

  /**
   * Open a one-shot SDCP binary socket (port 53484), handle optional auth,
   * expose a sendFrame helper that returns the full response Buffer, then close.
   * Used by both upload() and download().
   */
  private withSdcpSocket<T>(fn: (sendFrame: (f: Buffer) => Promise<Buffer>) => Promise<T>): Promise<T> {
    if (!this._ip) return Promise.reject(new Error('err_connect'));
    const ip = this._ip;
    const password = this._password;

    return new Promise<T>((resolve, reject) => {
      const sock = new Socket();
      let rxBuf = Buffer.alloc(0);
      const pending: Array<{ resolve: (b: Buffer) => void; reject: (e: Error) => void }> = [];

      const onBinaryData = (data: Buffer) => {
        rxBuf = Buffer.concat([rxBuf, data]);
        while (rxBuf.length >= 12) {
          if (rxBuf[0] !== 0x02 || rxBuf[1] !== 0x0a) { rxBuf = rxBuf.slice(1); continue; }
          const flen = 10 + ((rxBuf[8] << 8) | rxBuf[9]);
          if (rxBuf.length < flen) break;
          const frame = rxBuf.slice(0, flen);
          rxBuf = rxBuf.slice(flen);
          pending.shift()?.resolve(frame);
        }
      };

      const sendFrame = (frame: Buffer): Promise<Buffer> =>
        new Promise((res, rej) => { pending.push({ resolve: res, reject: rej }); sock.write(frame); });

      const connTimer = setTimeout(() => { sock.destroy(); reject(new Error('err_connect')); }, 15_000);

      sock.on('error', () => {
        clearTimeout(connTimer);
        pending.forEach((p) => p.reject(new Error('err_connect')));
        reject(new Error('err_connect'));
      });

      sock.once('connect', () => {
        clearTimeout(connTimer);

        // Auth phase: wait up to 1 s for a text greeting (NOKEY or SHA-256 challenge).
        // If no greeting arrives the firmware accepts binary frames without auth.
        let textBuf = '';
        const onTextData = (d: Buffer) => { textBuf += d.toString(); };
        sock.on('data', onTextData);

        const switchToBinary = () => { sock.removeListener('data', onTextData); sock.on('data', onBinaryData); };

        const doAuth = () => new Promise<void>((res, rej) => {
          const greetTimer = setTimeout(() => { switchToBinary(); res(); }, 1000);
          const poll = setInterval(() => {
            const nl = textBuf.search(/\n/);
            if (nl === -1) return;
            clearTimeout(greetTimer); clearInterval(poll);
            const challenge = textBuf.slice(0, nl).replace(/\r$/, '').trim();
            textBuf = textBuf.slice(nl + 1);
            if (challenge === 'NOKEY') { switchToBinary(); res(); return; }
            // SHA-256 challenge
            const hash = createHash('sha256').update(challenge + password).digest('hex');
            sock.write(hash + '\r\n');
            const authTimer = setTimeout(() => rej(new Error('err_timeout')), 5000);
            const pollOk = setInterval(() => {
              const nl2 = textBuf.search(/\n/);
              if (nl2 === -1) return;
              clearInterval(pollOk); clearTimeout(authTimer);
              if (textBuf.slice(0, nl2).replace(/\r$/, '').trim() === 'ok') { switchToBinary(); res(); }
              else rej(new Error('err_auth'));
            }, 20);
          }, 20);
          setTimeout(() => clearInterval(poll), 1100);
        });

        doAuth()
          .then(() => fn(sendFrame))
          .then((result) => { sock.destroy(); resolve(result); })
          .catch((err: unknown) => { sock.destroy(); reject(err instanceof Error ? err : new Error('err_cmd')); });
      });

      sock.connect(53484, ip);
    });
  }

  /**
   * Upload a gamma slot using the SDCP binary protocol (port 53484).
   * Sends 12 write frames (3 channels × 4 chunks of 16 values) + 1 activation frame.
   */
  async upload(
    slot: 7 | 8 | 9 | 10,
    channels: [number[], number[], number[]],
    onProgress?: (pct: number) => void,
  ): Promise<void> {
    const TOTAL = 13;
    let step = 0;
    await this.withSdcpSocket(async (sendFrame) => {
      for (let ch = 0; ch < 3; ch++) {
        const curve = channels[ch];
        for (let chunk = 0; chunk < 4; chunk++) {
          const si = (chunk * 16) as 0 | 16 | 32 | 48;
          const values = Array.from({ length: 16 }, (_, i) =>
            Math.round(Math.min(1023, Math.max(0, curve[(si + i) * 16] ?? 0))));
          await sendFrame(AdcpConnection.buildLdtWriteFrame(slot, ch as 0|1|2, si, values));
          step++;
          onProgress?.(Math.round((step / TOTAL) * 100));
        }
      }
      await sendFrame(AdcpConnection.buildActivateFrame(slot));
      onProgress?.(100);
    });
  }

  /**
   * Download a gamma slot using the SDCP binary protocol (port 53484).
   * Reads 12 chunks (3 channels × 4 chunks of 16 values) and reconstructs
   * 1024-point curves via linear interpolation between the 64 control points.
   */
  async download(slot: 7 | 8 | 9 | 10): Promise<[number[], number[], number[]]> {
    return this.withSdcpSocket(async (sendFrame) => {
      const channelPoints: number[][] = [[], [], []];
      for (let ch = 0; ch < 3; ch++) {
        for (let chunk = 0; chunk < 4; chunk++) {
          const si = (chunk * 16) as 0 | 16 | 32 | 48;
          const resp = await sendFrame(AdcpConnection.buildLdtReadFrame(slot, ch as 0|1|2, si));
          const count = resp[33];
          for (let i = 0; i < count; i++) channelPoints[ch].push(resp.readUInt16BE(34 + i * 2));
        }
      }
      const curves = channelPoints.map((points) => {
        const curve = new Array<number>(1024);
        for (let x = 0; x < 1024; x++) {
          const lo = Math.min(Math.floor(x / 16), 63);
          const hi = Math.min(lo + 1, 63);
          const t = (x - lo * 16) / 16;
          curve[x] = Math.round(Math.min(1023, Math.max(0, points[lo] + t * (points[hi] - points[lo]))));
        }
        return curve;
      });
      return curves as [number[], number[], number[]];
    });
  }
}
