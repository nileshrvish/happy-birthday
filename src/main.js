import './styles/main.css';
import { Game } from './game/Game.js';
import { UI } from './ui/UI.js';

const ui = new UI();
const game = new Game(document.getElementById('game'), ui);
window.__game = game; // handy for debugging in the console

game
  .load()
  .then(() => {
    ui.hideLoading();
    ui.showTitle(() => game.start());
  })
  .catch((err) => {
    console.error(err);
    document.querySelector('.loader-text').textContent = 'Something went wrong while loading. Please refresh. (' + err.message + ')';
  });
