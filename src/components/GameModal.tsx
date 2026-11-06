import React from 'react';

interface GameModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  playerColor?: string;
  icon?: string;
  autoCloseTimer?: number;
}

const GameModal = ({
  isOpen,
  message,
  confirmLabel = 'Confirm',
  cancelLabel,
  onConfirm,
  onCancel,
  playerColor,
  icon,
  autoCloseTimer
}: GameModalProps) => {
  const [countdown, setCountdown] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (isOpen && autoCloseTimer) {
      setCountdown(Math.ceil(autoCloseTimer / 1000));
    } else {
      setCountdown(null);
    }
  }, [isOpen, autoCloseTimer]);

  React.useEffect(() => {
    if (countdown !== null && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && isOpen) {
      onConfirm();
      setCountdown(null);
    }
  }, [countdown, isOpen, onConfirm]);
  if (!isOpen) return null;

  return (
    <div className="game-modal-overlay">
      <div className="game-modal-content">
        {icon && (
          <div className="game-modal-icon-container">
            <img src={icon} alt="Bonus" className="game-modal-icon" style={{
              width: '80px',
              height: '80px',
              marginBottom: '20px',
              filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.2))'
            }} />
          </div>
        )}
        <div className="game-modal-body">
          {message}
        </div>
        <div className="game-modal-footer">
          {onCancel && cancelLabel && (
            <button className="gm-btn gm-btn-cancel" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button
            className="gm-btn gm-btn-confirm"
            style={{
              backgroundColor: playerColor || '#667eea',
              color: 'white',
              boxShadow: `0 4px 15px ${playerColor}66`
            } as React.CSSProperties}
            onClick={onConfirm}
          >
            {confirmLabel} {countdown !== null ? `(${countdown}s)` : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GameModal;
