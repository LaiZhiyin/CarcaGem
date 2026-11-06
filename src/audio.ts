export class AudioManager {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private enabled: boolean = true;

    constructor() {

        document.addEventListener('click', this.init.bind(this), { once: true });
    }

    private init() {
        if (!this.ctx) {
            const webkitWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
            const AudioContextConstructor = window.AudioContext || webkitWindow.webkitAudioContext;
            if (!AudioContextConstructor) return;
            this.ctx = new AudioContextConstructor();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.5;
            this.masterGain.connect(this.ctx.destination);
        }
    }

    public playPlaceTile() {
        if (!this.enabled || !this.ctx || !this.masterGain) return;
        this.ctx.resume().then(() => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();
            osc.connect(gain);
            gain.connect(this.masterGain!);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(120, this.ctx!.currentTime);
            osc.frequency.exponentialRampToValueAtTime(40, this.ctx!.currentTime + 0.15);

            gain.gain.setValueAtTime(0.8, this.ctx!.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx!.currentTime + 0.15);

            osc.start();
            osc.stop(this.ctx!.currentTime + 0.15);
        });
    }

    public playRotate() {
        if (!this.enabled || !this.ctx || !this.masterGain) return;
        this.ctx.resume().then(() => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();
            osc.connect(gain);
            gain.connect(this.masterGain!);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(90, this.ctx!.currentTime);
            osc.frequency.exponentialRampToValueAtTime(30, this.ctx!.currentTime + 0.2);

            gain.gain.setValueAtTime(0.6, this.ctx!.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx!.currentTime + 0.2);

            osc.start();
            osc.stop(this.ctx!.currentTime + 0.2);
        });
    }

    public playPlaceMeeple() {
        if (!this.enabled || !this.ctx || !this.masterGain) return;
        this.ctx.resume().then(() => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();
            osc.connect(gain);
            gain.connect(this.masterGain!);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, this.ctx!.currentTime);
            osc.frequency.exponentialRampToValueAtTime(900, this.ctx!.currentTime + 0.02);

            gain.gain.setValueAtTime(0.6, this.ctx!.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx!.currentTime + 0.02);

            osc.start();
            osc.stop(this.ctx!.currentTime + 0.02);
        });
    }

    public playScore() {
        if (!this.enabled || !this.ctx || !this.masterGain) return;
        this.ctx.resume().then(() => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();
            osc.connect(gain);
            gain.connect(this.masterGain!);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, this.ctx!.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, this.ctx!.currentTime + 0.2);

            gain.gain.setValueAtTime(0.6, this.ctx!.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx!.currentTime + 0.2);

            osc.start();
            osc.stop(this.ctx!.currentTime + 0.2);
        });
    }

    public playError() {
        if (!this.enabled || !this.ctx || !this.masterGain) return;
        this.ctx.resume().then(() => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();
            osc.connect(gain);
            gain.connect(this.masterGain!);
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(250, this.ctx!.currentTime);
            osc.frequency.exponentialRampToValueAtTime(150, this.ctx!.currentTime + 0.15);
            gain.gain.setValueAtTime(0.5, this.ctx!.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx!.currentTime + 0.25);
            osc.start();
            osc.stop(this.ctx!.currentTime + 0.25);
        });
    }

    public playClick() {
        if (!this.enabled || !this.ctx || !this.masterGain) return;
        this.ctx.resume().then(() => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();
            osc.connect(gain);
            gain.connect(this.masterGain!);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(500, this.ctx!.currentTime);
            osc.frequency.exponentialRampToValueAtTime(700, this.ctx!.currentTime + 0.05);
            gain.gain.setValueAtTime(0.25, this.ctx!.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx!.currentTime + 0.06);
            osc.start();
            osc.stop(this.ctx!.currentTime + 0.06);
        });
    }
}

export const audioManager = new AudioManager();
