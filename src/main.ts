import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas');

if (!canvas) {
  throw new Error('Canvas element not found');
}

console.info('Lumen Pendulum scaffold ready');
