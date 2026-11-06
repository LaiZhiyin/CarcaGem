import React from 'react';
import { VERSION, BUILD_DATE_ID } from '../version';

interface HomePageProps {
  onSelectLocal: () => void;
  onSelectOnline: () => void;
}

const HomePage: React.FC<HomePageProps> = ({ onSelectLocal, onSelectOnline }) => {
  return (
    <div className="home-overlay">
        <div className="home-guide-link">
          <a href="/player-guide.html">Player Guide</a>
        </div>
      <div className="home-container">
        <div className="home-logo">
          <img src="/icons/carcagem_icon_512x512.png" alt="CarcaGem Logo" />
        </div>

        <h1 className="home-title">CarcaGem</h1>
        <p className="home-subtitle">A strategic tile-laying adventure across a living island.</p>

        <div className="home-menu">
          <button type="button" className="menu-btn primary" onClick={onSelectLocal}>
            <span className="btn-text">Local Game</span>
            <span className="btn-desc">Play solo or pass-and-play with friends</span>
          </button>
          <button type="button" className="menu-btn secondary" onClick={onSelectOnline}>
            <span className="btn-text">Online Game</span>
            <span className="btn-desc">Join friends in a shared room</span>
          </button>
        </div>
      </div>
      <div className="home-version">
        Version v{VERSION} · <span className="home-version-date" translate="no">{BUILD_DATE_ID}</span>
      </div>
      <div className="home-footer">
        © 2026 CarcaGem · <span className="home-email" translate="no">jasminelai@foxmail.com</span>
      </div>
    </div>
  );
};

export default HomePage;
