export class ParticleSystem {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.options = {
      type: 'gold', // 'gold', 'cyan', 'fire'
      density: 50,
      minSize: 1,
      maxSize: 3,
      minSpeed: 0.2,
      maxSpeed: 1,
      direction: 'up',
      ...options
    };
    this.animationId = null;
    this.active = false;
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.mouseX = -1000;
    this.mouseY = -1000;

    this.resize = this.resize.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
  }

  init() {
    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('mousemove', this.handleMouseMove);
    
    for (let i = 0; i < this.options.density; i++) {
      this.particles.push(this.createParticle(true));
    }

    this.active = true;
    this.animate();
  }

  destroy() {
    this.active = false;
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('mousemove', this.handleMouseMove);
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.particles = [];
    if (this.ctx && this.canvas) {
      try {
        this.ctx.clearRect(0, 0, this.canvas.width || 1, this.canvas.height || 1);
      } catch (_) {}
    }
  }

  resize() {
    this.width = Math.max(1, window.innerWidth);
    this.height = Math.max(1, window.innerHeight);
    this.dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  handleMouseMove(e) {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  }

  createParticle(randomY = false) {
    let x = Math.random() * this.width;
    let y = randomY 
      ? Math.random() * this.height
      : (this.options.direction === 'up' ? this.height + 10 : -10);
    
    if (this.options.direction === 'center-out') {
      x = this.width / 2 + (Math.random() - 0.5) * 200;
      y = this.height / 2 + (Math.random() - 0.5) * 200;
    }

    const maxLife = Math.random() * 130 + 90;
    return {
      x,
      y,
      size: Math.random() * (this.options.maxSize - this.options.minSize) + this.options.minSize,
      speedX: (Math.random() - 0.5) * (this.options.maxSpeed * 0.5),
      speedY: (Math.random() * (this.options.maxSpeed - this.options.minSpeed) + this.options.minSpeed) * (this.options.direction === 'up' ? -1 : 1),
      life: randomY ? Math.random() * maxLife : 0,
      maxLife,
      phase: Math.random() * Math.PI * 2,
      opacity: Math.random() * .38 + .34,
      shape: Math.random() > .82 ? 'diamond' : 'dust',
    };
  }

  animate() {
    if (!this.active) return;
    
    this.ctx.clearRect(0, 0, this.width, this.height);

    for (let i = 0; i < this.particles.length; i++) {
      let p = this.particles[i];
      
      let dx = this.mouseX - p.x;
      let dy = this.mouseY - p.y;
      let distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 0.001 && distance < 100) {
        let force = (100 - distance) / 100;
        p.x -= (dx / distance) * force * 1.25;
        p.y -= (dy / distance) * force * 1.25;
      }

      p.x += p.speedX + Math.sin(p.life * 0.025 + p.phase) * 0.22;
      p.y += p.speedY;
      p.life++;

      const lifeFade = Math.max(0, 1 - p.life / p.maxLife);
      const edgeFade = Math.min(1, p.y / 90, (this.height - p.y) / 90);
      const shimmer = .68 + Math.sin(p.life * .08 + p.phase) * .32;
      const alpha = Math.max(0, lifeFade * edgeFade * shimmer * p.opacity);

      this.ctx.save();
      this.ctx.beginPath();
      if (this.options.type === 'gold') {
        this.ctx.fillStyle = `rgba(244, 196, 92, ${alpha})`;
        this.ctx.shadowBlur = 7;
        this.ctx.shadowColor = '#f0b849';
      } else if (this.options.type === 'cyan') {
        this.ctx.fillStyle = `rgba(101, 220, 231, ${alpha})`;
        this.ctx.shadowBlur = 9;
        this.ctx.shadowColor = '#43cddd';
      } else {
        this.ctx.fillStyle = `rgba(245, 119, 49, ${alpha})`;
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#ff7135';
      }

      if (p.shape === 'diamond') {
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate(Math.PI / 4);
        this.ctx.rect(-p.size * .72, -p.size * .72, p.size * 1.44, p.size * 1.44);
      } else {
        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      }
      this.ctx.fill();
      this.ctx.restore();

      if (
        (this.options.direction === 'up' && p.y < -10) ||
        (this.options.direction === 'down' && p.y > this.height + 10) ||
        p.life > p.maxLife
      ) {
        this.particles[i] = this.createParticle();
      }
    }

    this.animationId = requestAnimationFrame(() => this.animate());
  }
}
