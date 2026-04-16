import { useState } from 'react';

export default function ConnectionPanel({ onConnect, lastIp, error }) {
  const [ip, setIp] = useState(lastIp || '');
  const [password, setPassword] = useState('');
  const [connecting, setConnecting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setConnecting(true);
    try {
      await onConnect(ip.trim(), password || undefined);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="connection-panel">
      <h3>Connect to Projector</h3>
      <form onSubmit={handleSubmit}>
        <label>
          IP Address
          <input
            type="text"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="192.168.0.233"
            required
            pattern="\d+\.\d+\.\d+\.\d+"
          />
        </label>
        <label>
          Password (if required)
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank if none"
          />
        </label>
        {error && (
          <div className="connection-error">
            {error === 'err_auth' ? 'Authentication failed — check password.' : 'Could not connect to projector.'}
          </div>
        )}
        <button type="submit" disabled={connecting}>
          {connecting ? 'Connecting…' : 'Connect'}
        </button>
      </form>
    </div>
  );
}
