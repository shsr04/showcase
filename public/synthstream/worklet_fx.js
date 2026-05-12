class SynthstreamInsertFx extends AudioWorkletProcessor {
    constructor() {
        super();
        this.targets = { dirt: 0, crush: 0, ring: 0, rumble: 0, noise: 0, reso: 0, shift: 0, sweep: 0, reverse: 0, slicer: 0, stutter: 0, brake: 0, freeze: 0, spiral: 0, mobius: 0, gate: 0, space: 0, pump: 0, width: 0 };
        this.smooth = { dirt: 0, crush: 0, ring: 0, rumble: 0, noise: 0, reso: 0, shift: 0, sweep: 0, reverse: 0, slicer: 0, stutter: 0, brake: 0, freeze: 0, spiral: 0, mobius: 0, gate: 0, space: 0, pump: 0, width: 0 };
        this.noiseKicks = [];
        this.pumpKicks = [];
        this.rumbleKicks = [];
        this.phase = 0;
        this.tempo = 124;
        this.maxBuffer = Math.floor(sampleRate * 2);
        this.sweepBufferLength = Math.floor(sampleRate * 0.07);
        this.resoBufferLength = Math.floor(sampleRate * 0.08);
        this.widthBufferLength = Math.floor(sampleRate * 0.025);
        this.writeFrame = typeof currentFrame === "number" ? currentFrame : 0;
        this.writeIndex = 0;
        this.repeatIndex = 0;
        this.repeatLength = 1;
        this.nextLatchFrame = 0;
        this.wasStuttering = false;
        this.pumpEnv = 0;
        this.rumbleEnv = 0;
        this.rumblePhase = 0;
        this.noiseKickEnv = 0;
        this.noiseMaxWet = 0.18;
        this.mobiusMaxWet = 0.12;
        this.spaceMaxWet = 0.52;
        this.gateGain = 1;
        this.widthLp = 0;
        this.widthMidLp = 0;
        this.widthLeftIndex = 0;
        this.widthRightIndex = Math.floor(this.widthBufferLength * 0.5);
        this.widthLeftDelay = new Float32Array(this.widthBufferLength);
        this.widthRightDelay = new Float32Array(this.widthBufferLength);
        this.widthModPhaseA = 0;
        this.widthModPhaseB = Math.PI * 0.5;
        this.resoFrequencies = [73.42, 82.41, 98, 110, 123.47, 146.83, 164.81, 196, 220, 246.94, 293.66, 329.63, 392, 440];
        this.channels = Array.from({ length: 2 }, (_, ch) => ({
            dirtTone: 0,
            crushHeld: 0,
            crushCount: 0,
            noiseSeed: (0x6d2b79f5 + ch * 0x1b873593) >>> 0,
            noiseLow: 0,
            noiseBand: 0,
            noiseAir: 0,
            noiseGate: 1,
            noiseRms: 0,
            noiseLimitGain: 1,
            noiseWetRms: 0,
            noiseWetLimitGain: 1,
            buffer: new Float32Array(this.maxBuffer),
            bufferPrimedSamples: 0,
            brakeActive: false,
            brakeReadFrame: 0,
            brakeElapsed: 0,
            brakeDuration: 0,
            repeat: new Float32Array(this.maxBuffer),
            reverseBuffer: new Float32Array(this.maxBuffer),
            spiralBuffer: new Float32Array(this.maxBuffer),
            spiralIndex: 0,
            spiralLp: 0,
            spiralBp: 0,
            spiralReturnRms: 0,
            spiralReturnLimitGain: 1,
            mobiusPhases: [0, 0, 0, 0],
            mobiusFb: 0,
            mobiusLp: 0,
            mobiusBp: 0,
            sweepBuffer: new Float32Array(this.sweepBufferLength),
            sweepIndex: 0,
            resoBuffer: new Float32Array(this.resoBufferLength),
            resoIndex: 0,
            shiftPhase: 0,
            shiftQuad: 0,
            shiftLast: 0,
            ringPhase: 0,
            ringTone: 0,
            freezeSeed: (0x9e3779b9 + ch * 0x85ebca6b) >>> 0,
            freezeLp: 0,
            rumbleLp: 0,
            rumbleHp: 0,
            rumbleRms: 0,
            rumbleLimitGain: 1,
            spaceLp: 0,
            spaceDamp: [0, 0, 0, 0],
            spaceLines: [
                new Float32Array(Math.floor(sampleRate * 0.029)),
                new Float32Array(Math.floor(sampleRate * 0.037)),
                new Float32Array(Math.floor(sampleRate * 0.053)),
                new Float32Array(Math.floor(sampleRate * 0.071)),
            ],
        }));
        this.port.onmessage = (event) => {
            const data = event.data || {};
            if (data.type === "params") {
                Object.keys(this.targets).forEach(key => {
                    this.targets[key] = Math.max(0, Math.min(1, Number(data.values?.[key] || 0) / 100));
                });
            }
            if (data.type === "kick") {
                const frame = Math.max(currentFrame, Math.round(Number(data.time || currentTime) * sampleRate));
                this.noiseKicks.push(frame);
                this.pumpKicks.push(frame);
                this.rumbleKicks.push(frame);
                if (this.noiseKicks.length > 32) this.noiseKicks.splice(0, this.noiseKicks.length - 32);
                if (this.pumpKicks.length > 32) this.pumpKicks.splice(0, this.pumpKicks.length - 32);
                if (this.rumbleKicks.length > 32) this.rumbleKicks.splice(0, this.rumbleKicks.length - 32);
            }
            if (data.type === "tempo") this.tempo = Number(data.bpm);
        };
    }

    smoothParam(name) {
        const coeff = 1 - Math.exp(-1 / (sampleRate * 0.022));
        this.smooth[name] += (this.targets[name] - this.smooth[name]) * coeff;
        return this.smooth[name];
    }

    softClip(x, amount, channel) {
        if (amount < 0.002) return x;
        const pregain = 1 + amount * amount * 13;
        const wet = Math.min(0.92, amount * 0.94);
        const trim = 1 / (1 + amount * 1.8);
        const toneTarget = Math.tanh(x * pregain) * trim;
        channel.dirtTone += (toneTarget - channel.dirtTone) * (0.08 + amount * 0.18);
        const driven = toneTarget * (1 - amount * 0.34) + channel.dirtTone * amount * 0.34;
        return x * (1 - wet) + driven * wet;
    }

    crush(x, amount, channel) {
        if (amount < 0.002) return x;
        const usable = Math.min(1, amount * 2);
        const harsh = Math.max(0, amount * 2 - 1);
        const holdSamples = Math.max(1, Math.round(1 + usable * 7 + harsh * harsh * 56));
        const bits = Math.max(4, 16 - usable * 4 - harsh * 8);
        const levels = Math.pow(2, Math.round(bits));
        if (channel.crushCount <= 0) {
            channel.crushHeld = Math.round(x * levels) / levels;
            channel.crushCount = holdSamples;
        }
        channel.crushCount -= 1;
        const wet = Math.min(0.92, amount * 0.9);
        return x * (1 - wet) + channel.crushHeld * wet;
    }

    randomNoise(channel) {
        channel.noiseSeed = (channel.noiseSeed * 1664525 + 1013904223) >>> 0;
        return channel.noiseSeed / 2147483648 - 1;
    }

    updateNoiseKickDuck(frame, amount) {
        while (this.noiseKicks.length && this.noiseKicks[0] <= frame) {
            this.noiseKickEnv = 1;
            this.noiseKicks.shift();
        }
        const release = 0.08 + (1 - amount) * 0.16;
        this.noiseKickEnv *= Math.exp(-1 / (sampleRate * release));
        const depth = Math.min(0.62, Math.max(0, amount - 0.18) * 0.78);
        return 1 - this.noiseKickEnv * depth;
    }

    targetNoiseLevel(amount) {
        return 0.024 + Math.pow(amount, 1.35) * 0.15;
    }

    clampNoiseRms(sample, amount, channel) {
        const rmsCoeff = 1 - Math.exp(-1 / (sampleRate * 0.026));
        channel.noiseRms += (sample * sample - channel.noiseRms) * rmsCoeff;
        const rms = Math.sqrt(Math.max(0, channel.noiseRms));
        const target = this.targetNoiseLevel(amount);
        const desiredGain = rms > target ? target / Math.max(0.000001, rms) : 1;
        const gainCoeff = desiredGain < channel.noiseLimitGain ? 0.18 : 0.018;
        channel.noiseLimitGain += (desiredGain - channel.noiseLimitGain) * gainCoeff;
        channel.noiseLimitGain = Math.min(1, Math.max(0.05, channel.noiseLimitGain));
        return sample * channel.noiseLimitGain;
    }

    clampDynamicRms(sample, target, channel, rmsKey, gainKey, floor = 0.04) {
        const rmsCoeff = 1 - Math.exp(-1 / (sampleRate * 0.03));
        channel[rmsKey] += (sample * sample - channel[rmsKey]) * rmsCoeff;
        const rms = Math.sqrt(Math.max(0, channel[rmsKey]));
        const desiredGain = rms > target ? target / Math.max(0.000001, rms) : 1;
        const gainCoeff = desiredGain < channel[gainKey] ? 0.2 : 0.016;
        channel[gainKey] += (desiredGain - channel[gainKey]) * gainCoeff;
        channel[gainKey] = Math.min(1, Math.max(floor, channel[gainKey]));
        return sample * channel[gainKey];
    }

    targetNoiseWetLevel(amount) {
        return 0.032 + Math.pow(amount, 1.25) * 0.063;
    }

    targetSpiralReturnLevel(amount) {
        return 0.063 + Math.pow(amount, 1.15) * 0.049;
    }

    softLimitMixed(sample) {
        return Math.tanh(sample * 1.22) * 0.96;
    }

    noiseLayer(x, amount, channel, ch, frame, kickDuck, pumpGain) {
        if (amount < 0.002) {
            channel.noiseGate += (1 - channel.noiseGate) * 0.02;
            channel.noiseRms += (0 - channel.noiseRms) * 0.02;
            channel.noiseLimitGain += (1 - channel.noiseLimitGain) * 0.02;
            channel.noiseWetRms += (0 - channel.noiseWetRms) * 0.02;
            channel.noiseWetLimitGain += (1 - channel.noiseWetLimitGain) * 0.02;
            return x;
        }

        const beat = sampleRate * 60 / this.tempo;
        const pulseAmount = Math.max(0, (amount - 0.24) / 0.76);
        const dense = amount > 0.68;
        const div = dense ? beat / 4 : beat / 2;
        const phase = (this.phase % div) / div;
        const openWidth = dense ? 0.2 + (1 - amount) * 0.12 : 0.54 - amount * 0.18;
        const pulseOpen = phase < openWidth ? 1 : 0;
        const pulseCurve = pulseOpen ? 1 - Math.pow(phase / Math.max(0.001, openWidth), 2) * 0.22 : 0;
        const constantAir = Math.max(0, 1 - amount * 1.85);
        const gateTarget = Math.max(constantAir, pulseCurve);
        const gateCoeff = pulseOpen ? 0.038 + amount * 0.12 : 0.006 + amount * 0.035;
        channel.noiseGate += (gateTarget - channel.noiseGate) * gateCoeff;

        const white = this.randomNoise(channel);
        const slowRise = dense ? Math.pow((this.phase % (beat * 4)) / (beat * 4), 1.6) : 0;
        const wobble = Math.sin(this.phase / sampleRate * Math.PI * 2 * (0.09 + amount * 0.19) + ch * 1.9) * 0.5 + 0.5;
        const cutoff = Math.min(11800, 1300 + amount * amount * 7800 + slowRise * 2600 + wobble * amount * 1700);
        const f = Math.min(0.82, 2 * Math.sin(Math.PI * cutoff / sampleRate));
        const damping = Math.max(0.16, 1.08 - amount * 0.78);

        channel.noiseLow += f * channel.noiseBand;
        const high = white - channel.noiseLow - damping * channel.noiseBand;
        channel.noiseBand += f * high;
        const airCoeff = 0.008 + amount * 0.018;
        channel.noiseAir += (white - channel.noiseAir) * airCoeff;
        const highpass = white - channel.noiseAir;
        const bandpass = Math.tanh(channel.noiseBand * (1.15 + amount * 2.6));
        const pressure = Math.tanh((bandpass * (0.72 + amount * 1.25) + highpass * (0.32 + amount * 0.18)) * (0.9 + amount * 0.7));
        const filtered = amount < 0.35
            ? highpass * 0.72 + bandpass * amount * 0.45
            : pressure;

        const env = (1 - pulseAmount * 0.45) + channel.noiseGate * pulseAmount * 1.15;
        const resComp = 1 / (1 + amount * 1.65);
        const cappedNoise = this.clampNoiseRms(filtered * env * kickDuck * pumpGain * resComp, amount, channel);
        const wet = Math.min(1, amount * amount * 0.9 + amount * 0.12) * this.noiseMaxWet;
        const wetNoise = this.clampDynamicRms(cappedNoise * wet, this.targetNoiseWetLevel(amount), channel, "noiseWetRms", "noiseWetLimitGain", 0.05);
        return this.softLimitMixed(x + wetNoise);
    }

    updatePump(frame, amount) {
        while (this.pumpKicks.length && this.pumpKicks[0] <= frame) {
            this.pumpEnv = 1;
            this.pumpKicks.shift();
        }
        if (amount < 0.002) {
            this.pumpEnv *= 0.995;
            return 1;
        }
        const release = 0.11 + (1 - amount) * 0.24;
        this.pumpEnv *= Math.exp(-1 / (sampleRate * release));
        const depth = Math.min(0.82, Math.pow(amount, 1.08) * 0.82);
        return Math.max(0.1, 1 - this.pumpEnv * depth);
    }

    updateRumble(frame, amount) {
        while (this.rumbleKicks.length && this.rumbleKicks[0] <= frame) {
            this.rumbleEnv = Math.min(1.4, this.rumbleEnv + 1);
            this.rumbleKicks.shift();
        }
        if (amount < 0.002) {
            this.rumbleEnv *= 0.992;
            return 0;
        }
        const release = 0.16 + (1 - amount) * 0.36;
        this.rumbleEnv *= Math.exp(-1 / (sampleRate * release));
        return this.rumbleEnv;
    }

    maybeLatchStutter(amount, frame) {
        const active = amount > 0.015;
        const beat = sampleRate * 60 / this.tempo;
        const lengthTarget = beat * (0.5 - Math.min(0.44, amount * 0.44));
        const length = Math.max(96, Math.min(this.maxBuffer - 1, Math.round(lengthTarget)));
        if (!active) {
            this.wasStuttering = false;
            this.nextLatchFrame = frame;
            return;
        }
        if (!this.wasStuttering || frame >= this.nextLatchFrame || Math.abs(length - this.repeatLength) > sampleRate * 0.03) {
            this.repeatLength = length;
            const start = (this.writeIndex - length + this.maxBuffer) % this.maxBuffer;
            this.channels.forEach(channel => {
                for (let i = 0; i < length; i += 1) {
                    channel.repeat[i] = channel.buffer[(start + i) % this.maxBuffer];
                }
            });
            this.repeatIndex = 0;
            this.nextLatchFrame = frame + length;
            this.wasStuttering = true;
        }
    }

    stutter(x, amount, channel) {
        if (amount < 0.015 || this.repeatLength <= 1) return x;
        const wet = Math.min(0.92, 0.18 + amount * 0.78);
        const chopPhase = this.repeatIndex / Math.max(1, this.repeatLength);
        const chop = amount < 0.45 ? 1 : (chopPhase < 0.72 - amount * 0.28 ? 1 : 1 - amount * 0.65);
        return x * (1 - wet) + channel.repeat[this.repeatIndex] * wet * chop;
    }

    brake(x, channel, amount) {
        if (!Number.isFinite(amount)) return x;
    
        const threshold = 0.01;
    
        if (amount < threshold) {
            channel.brakeActive = false;
            channel.brakeReadFrame = 0;
            channel.brakeWet = 0;
            return x;
        }
    
        if (!channel.brakeActive) {
            const readDelay = Math.min(
                channel.bufferPrimedSamples - 2,
                Math.max(64, Math.floor(sampleRate * 0.006))
            );
    
            if (readDelay < 4) return x;
    
            channel.brakeActive = true;
            channel.brakeReadFrame = this.writeFrame - readDelay;
            channel.brakeWet = 0;
        }
    
        const k = Math.max(0, Math.min(1, amount));
        const speed = Math.pow(1 - k, 2.2);
    
        const wet = this.readCircularAbs(channel.buffer, channel.brakeReadFrame);
    
        channel.brakeReadFrame += speed;
    
        // Fade into the slowed buffer to avoid clicks.
        channel.brakeWet = Math.min(
            1,
            (channel.brakeWet || 0) + 1 / (sampleRate * 0.01)
        );
    
        // Prevent read head from falling too far behind the write head.
        const maxLag = this.maxBuffer - 256;
        const lag = this.writeFrame - channel.brakeReadFrame;
    
        if (lag > maxLag) {
            channel.brakeReadFrame = this.writeFrame - 256;
        }
    
        return x * (1 - channel.brakeWet) + wet * channel.brakeWet;
    }

    freezeRandom(channel) {
        channel.freezeSeed = (channel.freezeSeed * 1103515245 + 12345) >>> 0;
        return channel.freezeSeed / 2147483648 - 1;
    }

    freeze(x, amount, channel, ch) {
        if (amount < 0.015) {
            channel.freezeLp += (0 - channel.freezeLp) * 0.02;
            return x;
        }
        const beat = sampleRate * 60 / this.tempo;
        const base = beat * (amount < 0.42 ? 0.25 : amount < 0.72 ? 0.5 : 1);
        const density = 2 + Math.floor(amount * 3);
        let cloud = 0;
        let weight = 0;
        for (let g = 0; g < density; g += 1) {
            const grainPhase = ((this.phase + g * base / density + ch * 97) % base) / base;
            const env = Math.sin(grainPhase * Math.PI);
            const jitter = this.freezeRandom(channel) * beat * (0.006 + amount * 0.022);
            const drift = Math.sin(this.phase / sampleRate * Math.PI * 2 * (0.07 + g * 0.031) + ch) * beat * amount * 0.04;
            const delay = Math.max(32, Math.min(this.maxBuffer - 2, base * (0.35 + g * 0.19) + jitter + drift));
            cloud += this.readDelay(channel.buffer, this.writeIndex, delay) * env;
            weight += env;
        }
        cloud /= Math.max(0.001, weight);
        channel.freezeLp += (cloud - channel.freezeLp) * (0.18 - amount * 0.08);
        const wet = Math.min(0.84, 0.1 + amount * 0.78);
        return x * (1 - wet) + channel.freezeLp * wet;
    }

    beatReverse(x, amount, channel) {
        channel.reverseBuffer[this.writeIndex] = x;
        if (amount < 0.015) return x;
        const beat = sampleRate * 60 / this.tempo;
        const length = Math.max(128, Math.min(this.maxBuffer - 1, Math.round(beat * (1 - amount * 0.875))));
        const slicePos = this.phase % length;
        const readOffset = length - 1 - slicePos;
        const readIndex = (this.writeIndex - readOffset + this.maxBuffer) % this.maxBuffer;
        const reversed = channel.reverseBuffer[readIndex] || 0;
        const edge = Math.max(32, Math.min(960, length * 0.12));
        const fade = Math.min(1, slicePos / edge, (length - 1 - slicePos) / edge);
        const wet = Math.min(0.86, 0.12 + amount * 0.78) * Math.max(0, fade);
        return x * (1 - wet) + reversed * wet;
    }

    spiral(x, amount, channel) {
        if (amount < 0.002) {
            channel.spiralBuffer[channel.spiralIndex] = x;
            channel.spiralIndex = (channel.spiralIndex + 1) % channel.spiralBuffer.length;
            channel.spiralLp += (0 - channel.spiralLp) * 0.01;
            channel.spiralBp += (0 - channel.spiralBp) * 0.01;
            channel.spiralReturnRms += (0 - channel.spiralReturnRms) * 0.02;
            channel.spiralReturnLimitGain += (1 - channel.spiralReturnLimitGain) * 0.02;
            return x;
        }
        const beat = sampleRate * 60 / this.tempo;
        const div = amount < 0.33 ? 0.75 : amount < 0.68 ? 0.5 : 0.25;
        const wobble = Math.sin(this.phase / sampleRate * Math.PI * 2 * (0.12 + amount * 0.48));
        const delay = Math.max(96, Math.min(this.maxBuffer - 2, beat * div * (1 + wobble * amount * 0.08)));
        const delayed = this.readDelay(channel.spiralBuffer, channel.spiralIndex, delay);
        const toneFreq = 180 + amount * amount * 2400 + (wobble + 1) * amount * 520;
        const f = Math.min(0.55, 2 * Math.sin(Math.PI * toneFreq / sampleRate));
        const damp = Math.max(0.24, 1.05 - amount * 0.62);
        channel.spiralLp += f * channel.spiralBp;
        const high = delayed - channel.spiralLp - damp * channel.spiralBp;
        channel.spiralBp += f * high;
        const tonal = Math.tanh((channel.spiralBp * (1.2 + amount * 2.2) + channel.spiralLp * 0.42) * (0.88 + amount * 0.55));
        const feedback = Math.min(0.68, 0.14 + amount * 0.54);
        const write = Math.max(-1.15, Math.min(1.15, x + tonal * feedback));
        channel.spiralBuffer[channel.spiralIndex] = write;
        channel.spiralIndex = (channel.spiralIndex + 1) % channel.spiralBuffer.length;
        const wet = Math.min(0.72, amount * 0.76);
        const spiralReturn = this.clampDynamicRms(tonal * wet, this.targetSpiralReturnLevel(amount), channel, "spiralReturnRms", "spiralReturnLimitGain", 0.05);
        return this.softLimitMixed(x + spiralReturn);
    }

    mobius(x, amount, channel, ch) {
        if (amount < 0.002) {
            channel.mobiusFb += (0 - channel.mobiusFb) * 0.01;
            channel.mobiusLp += (0 - channel.mobiusLp) * 0.01;
            channel.mobiusBp += (0 - channel.mobiusBp) * 0.01;
            return x;
        }
        const rate = 0.045 + amount * amount * 0.18;
        const direction = amount < 0.5 ? -1 : 1;
        const cycleRaw = (this.phase / sampleRate * rate + ch * 0.035) % 1;
        const cycle = direction > 0 ? cycleRaw : 1 - cycleRaw;
        const base = 82.41;
        let shepard = 0;
        let ampSum = 0;
        for (let i = 0; i < 4; i += 1) {
            const layerPos = (i + cycle) / 4;
            const amp = Math.sin(layerPos * Math.PI);
            const freq = Math.min(5600, base * Math.pow(2, i - 1 + cycle * 2.4));
            channel.mobiusPhases[i] += Math.PI * 2 * freq / sampleRate;
            if (channel.mobiusPhases[i] > Math.PI * 2) channel.mobiusPhases[i] -= Math.PI * 2;
            shepard += Math.sin(channel.mobiusPhases[i]) * amp;
            ampSum += amp;
        }
        shepard /= Math.max(0.001, ampSum);
        const toneFreq = 360 + amount * amount * 5200 + cycle * amount * 2200;
        const f = Math.min(0.62, 2 * Math.sin(Math.PI * toneFreq / sampleRate));
        const damp = Math.max(0.2, 0.92 - amount * 0.54);
        const excite = shepard + channel.mobiusFb * (0.28 + amount * 0.34) + x * amount * 0.18;
        channel.mobiusLp += f * channel.mobiusBp;
        const high = excite - channel.mobiusLp - damp * channel.mobiusBp;
        channel.mobiusBp += f * high;
        const pressure = Math.tanh((shepard * 0.62 + channel.mobiusBp * (1.1 + amount * 2.5)) * (0.92 + amount * 0.9));
        channel.mobiusFb = Math.max(-0.95, Math.min(0.95, pressure));
        const wet = Math.min(1, amount * amount * 0.94 + amount * 0.13) * this.mobiusMaxWet;
        return this.softLimitMixed(x + pressure * wet);
    }

    gateAmount(amount) {
        if (amount < 0.002) return 1;
        const beat = sampleRate * 60 / this.tempo;
        const dense = amount > 0.66;
        const div = amount < 0.34 ? beat / 2 : dense ? beat / 8 : beat / 4;
        const phase = (this.phase % div) / div;
        const openWidth = amount < 0.34 ? 0.86 : amount < 0.66 ? 0.58 : 0.34;
        const open = phase < openWidth ? 1 : 0;
        const depth = amount < 0.34 ? amount * 0.45 : Math.min(0.96, 0.2 + amount * 0.78);
        const target = 1 - depth * (1 - open);
        const edgeMs = 0.001 + (1 - amount) * 0.004;
        const coeff = 1 - Math.exp(-1 / (sampleRate * edgeMs));
        this.gateGain += (target - this.gateGain) * coeff;
        return this.gateGain;
    }

    readDelay(buffer, index, delay) {
        const length = buffer.length;
        const read = (index - delay + length) % length;
        return this.readBufferAt(buffer, read);
    }

    readBufferAt(buffer, position, readLength = buffer.length) {
        const length = readLength;
        const read = (position + length) % length;
        const i0 = Math.floor(read);
        const i1 = (i0 + 1) % length;
        const frac = read - i0;
        return buffer[i0] * (1 - frac) + buffer[i1] * frac;
    }

    readCircularAbs(buffer, absFrame) {
        if (!Number.isFinite(absFrame)) return 0;
    
        const i0Abs = Math.floor(absFrame);
        const frac = absFrame - i0Abs;
    
        const i0 = ((i0Abs % this.maxBuffer) + this.maxBuffer) % this.maxBuffer;
        const i1 = (i0 + 1) % this.maxBuffer;
    
        const a = buffer[i0] || 0;
        const b = buffer[i1] || 0;
    
        return a + (b - a) * frac;
    }

    sweep(x, amount, channel, ch) {
        if (amount < 0.002) {
            channel.sweepBuffer[channel.sweepIndex] = x;
            channel.sweepIndex = (channel.sweepIndex + 1) % channel.sweepBuffer.length;
            return x;
        }
        const phase = this.phase / sampleRate;
        const rate = 0.055 + amount * amount * 0.42;
        const lfo = Math.sin(phase * Math.PI * 2 * rate + ch * 1.7);
        const subtle = Math.min(1, amount * 2.2);
        const harsh = Math.max(0, amount * 1.7 - 0.7);
        const delay = 18 + subtle * 170 + harsh * 310 + (1 + lfo) * (18 + amount * 250);
        const delayed = this.readDelay(channel.sweepBuffer, channel.sweepIndex, delay);
        const feedback = Math.min(0.72, amount * 0.18 + harsh * 0.42);
        channel.sweepBuffer[channel.sweepIndex] = Math.max(-1.2, Math.min(1.2, x + delayed * feedback));
        channel.sweepIndex = (channel.sweepIndex + 1) % channel.sweepBuffer.length;
        const wet = Math.min(0.78, 0.12 + amount * 0.72);
        const polarity = amount < 0.42 ? -1 : 1;
        return x * (1 - wet) + delayed * wet * polarity;
    }

    resonator(x, amount, channel) {
        if (amount < 0.002) {
            channel.resoBuffer[channel.resoIndex] = 0;
            channel.resoIndex = (channel.resoIndex + 1) % channel.resoBuffer.length;
            return x;
        }
        const bend = Math.pow(amount, 0.82);
        const noteIndex = Math.min(this.resoFrequencies.length - 1, Math.floor(bend * this.resoFrequencies.length));
        const fine = 1 + (amount - 0.5) * 0.035;
        const frequency = this.resoFrequencies[noteIndex] * fine;
        const delay = Math.max(8, Math.min(channel.resoBuffer.length - 2, sampleRate / frequency));
        const comb = this.readDelay(channel.resoBuffer, channel.resoIndex, delay);
        const feedback = Math.min(0.86, 0.34 + amount * 0.48);
        channel.resoBuffer[channel.resoIndex] = Math.max(-1.15, Math.min(1.15, x + comb * feedback));
        channel.resoIndex = (channel.resoIndex + 1) % channel.resoBuffer.length;
        const wet = Math.min(0.74, 0.13 + amount * 0.68);
        return x * (1 - wet) + Math.tanh(comb * (1.4 + amount * 2.1)) * wet;
    }

    shift(x, amount, channel, ch) {
        if (amount < 0.002) return x;
        const low = Math.min(1, amount * 2.4);
        const high = Math.max(0, amount * 1.35 - 0.35);
        const frequency = 0.35 + low * 6 + high * high * 145;
        channel.shiftPhase += Math.PI * 2 * frequency / sampleRate * (ch ? 1.013 : 1);
        if (channel.shiftPhase > Math.PI * 2) channel.shiftPhase -= Math.PI * 2;
        const diff = x - channel.shiftLast;
        channel.shiftLast = x;
        channel.shiftQuad += (diff - channel.shiftQuad) * (0.08 + amount * 0.18);
        const shifted = x * Math.cos(channel.shiftPhase) - channel.shiftQuad * Math.sin(channel.shiftPhase) * (2.2 + amount * 1.6);
        const wet = Math.min(0.82, amount * 0.86);
        return x * (1 - wet) + shifted * wet;
    }

    ring(x, amount, channel, ch) {
        if (amount < 0.002) return x;
        const notes = [110, 146.83, 196, 246.94, 329.63, 440, 587.33, 739.99];
        const bend = Math.min(notes.length - 1, Math.floor(amount * notes.length));
        const harmonic = amount < 0.55 ? 1.5 : amount < 0.82 ? 2.25 : 3.01;
        const frequency = notes[bend] * harmonic * (ch ? 1.006 : 1);
        channel.ringPhase += Math.PI * 2 * frequency / sampleRate;
        if (channel.ringPhase > Math.PI * 2) channel.ringPhase -= Math.PI * 2;
        const carrier = Math.sin(channel.ringPhase) * 0.74 + Math.sin(channel.ringPhase * 1.997) * 0.26;
        const modulated = x * carrier;
        channel.ringTone += (modulated - channel.ringTone) * (0.22 + amount * 0.18);
        const wet = Math.min(0.64, 0.08 + amount * 0.58);
        return x * (1 - wet) + channel.ringTone * wet;
    }

    rumble(x, amount, channel, ch, env) {
        if (amount < 0.002 || env < 0.0001) {
            channel.rumbleLp += (0 - channel.rumbleLp) * 0.004;
            channel.rumbleHp += (0 - channel.rumbleHp) * 0.004;
            channel.rumbleRms += (0 - channel.rumbleRms) * 0.02;
            channel.rumbleLimitGain += (1 - channel.rumbleLimitGain) * 0.02;
            return x;
        }
        const frequency = 38 + amount * 30 + env * 12;
        this.rumblePhase += Math.PI * 2 * frequency / sampleRate * (ch ? 1.003 : 1);
        if (this.rumblePhase > Math.PI * 2) this.rumblePhase -= Math.PI * 2;
        const sub = Math.sin(this.rumblePhase) * env;
        const lowCoeff = Math.min(0.18, 2 * Math.sin(Math.PI * (72 + amount * 58) / sampleRate));
        channel.rumbleLp += (sub - channel.rumbleLp) * lowCoeff;
        channel.rumbleHp += (x - channel.rumbleHp) * 0.006;
        const lowSource = x - channel.rumbleHp;
        const pressure = Math.tanh((channel.rumbleLp * (0.9 + amount * 1.8) + lowSource * amount * 0.35) * 1.35);
        const wet = Math.min(0.42, amount * 0.48);
        const limited = this.clampDynamicRms(pressure * wet, 0.045 + amount * 0.045, channel, "rumbleRms", "rumbleLimitGain", 0.08);
        return this.softLimitMixed(x + limited);
    }

    slicerAmount(amount) {
        if (amount < 0.002) return 1;
        const beat = sampleRate * 60 / this.tempo;
        const div = amount < 0.34 ? beat / 4 : amount < 0.67 ? beat / 8 : beat / 16;
        const phase = (this.phase % div) / div;
        const alternate = Math.floor(this.phase / div) % 4;
        const openWidth = amount < 0.34 ? 0.72 : amount < 0.67 ? 0.5 : (alternate === 2 ? 0.78 : 0.31);
        const edge = 0.045 + (1 - amount) * 0.055;
        const attack = Math.min(1, phase / edge);
        const release = Math.min(1, (openWidth - phase) / edge);
        const open = phase < openWidth ? Math.max(0, Math.min(attack, release)) : 0;
        const ghost = amount > 0.62 && alternate === 3 ? 0.32 : 0;
        const depth = Math.min(0.98, 0.2 + amount * 0.84);
        return 1 - depth * (1 - Math.max(open, ghost));
    }

    space(x, amount, channel, ch) {
        if (amount < 0.002) return x;
        const lowCutCoeff = 0.004 + amount * 0.022;
        channel.spaceLp += (x - channel.spaceLp) * lowCutCoeff;
        const input = (x - channel.spaceLp) * (0.5 + amount * 0.58);
        const feedback = Math.min(0.88, 0.42 + amount * 0.42);
        const dampCoeff = 0.18 - amount * 0.115;
        let wash = 0;
        for (let i = 0; i < channel.spaceLines.length; i += 1) {
            const line = channel.spaceLines[i];
            const write = this.phase % line.length;
            const size = 0.38 + amount * 0.56;
            const offset = Math.max(1, Math.floor(line.length * size));
            const read = (write - offset + line.length) % line.length;
            const delayed = line[read];
            channel.spaceDamp[i] += (delayed - channel.spaceDamp[i]) * dampCoeff;
            line[write] = Math.max(-1.1, Math.min(1.1, input + channel.spaceDamp[i] * feedback * (i % 2 ? -0.82 : 0.82)));
            wash += delayed * (i % 2 ? -0.25 : 0.25);
        }
        const wet = Math.min(1, amount * 1.02) * this.spaceMaxWet;
        return x * (1 - wet) + wash * wet * (ch ? -1 : 1);
    }

    applyWidth(left, right, amount) {
        if (amount < 0.002) return [left, right];
        const mid = (left + right) * 0.5;
        const rawSide = (left - right) * 0.5;
        const sideHpCoeff = 0.012 + amount * 0.018;
        const midLpCoeff = 0.006 + amount * 0.008;
        this.widthLp += (rawSide - this.widthLp) * sideHpCoeff;
        this.widthMidLp += (mid - this.widthMidLp) * midLpCoeff;

        const sideHigh = rawSide - this.widthLp;
        const midLow = this.widthMidLp;
        const midHigh = mid - midLow;
        const monoSource = Math.abs(sideHigh) < Math.abs(midHigh) * 0.04;
        const generatedSide = midHigh * (monoSource ? 0.38 : 0.22) * amount;

        this.widthModPhaseA += Math.PI * 2 * (0.07 + amount * 0.18) / sampleRate;
        this.widthModPhaseB += Math.PI * 2 * (0.11 + amount * 0.23) / sampleRate;
        if (this.widthModPhaseA > Math.PI * 2) this.widthModPhaseA -= Math.PI * 2;
        if (this.widthModPhaseB > Math.PI * 2) this.widthModPhaseB -= Math.PI * 2;

        const haasDepth = Math.min(1, amount * 1.8);
        const chorusDepth = Math.max(0, amount * 1.55 - 0.55);
        const modA = Math.sin(this.widthModPhaseA);
        const modB = Math.sin(this.widthModPhaseB + Math.PI);
        const leftDelay = 3 + haasDepth * 18 + chorusDepth * (11 + modA * 7);
        const rightDelay = 5 + haasDepth * 24 + chorusDepth * (13 + modB * 8);
        const leftMicro = this.readDelay(this.widthLeftDelay, this.widthLeftIndex, leftDelay);
        const rightMicro = this.readDelay(this.widthRightDelay, this.widthRightIndex, rightDelay);
        this.widthLeftDelay[this.widthLeftIndex] = midHigh + generatedSide;
        this.widthRightDelay[this.widthRightIndex] = midHigh - generatedSide;
        this.widthLeftIndex = (this.widthLeftIndex + 1) % this.widthLeftDelay.length;
        this.widthRightIndex = (this.widthRightIndex + 1) % this.widthRightDelay.length;

        const microSide = (leftMicro - rightMicro) * (0.18 + amount * 0.24);
        const chorusSide = chorusDepth > 0 ? (leftMicro + rightMicro) * chorusDepth * 0.08 : 0;
        const sideGain = 0.12 + amount * 1.72;
        const side = sideHigh * sideGain + generatedSide + microSide + chorusSide;
        const highMidTrim = 1 - Math.max(0, amount - 0.72) * 0.12;
        const trim = 1 / (1 + Math.max(0, amount - 0.55) * 0.68);
        return [(midLow + midHigh * highMidTrim + side) * trim, (midLow + midHigh * highMidTrim - side) * trim];
    }

    process(inputs, outputs) {
        const input = inputs[0];
        const output = outputs[0];
        const frames = output[0]?.length || 0;
        if (!input.length) return true;

        for (let i = 0; i < frames; i += 1) {
            const dirt = this.smoothParam("dirt");
            const crush = this.smoothParam("crush");
            const ring = this.smoothParam("ring");
            const rumble = this.smoothParam("rumble");
            const noise = this.smoothParam("noise");
            const reso = this.smoothParam("reso");
            const shift = this.smoothParam("shift");
            const sweep = this.smoothParam("sweep");
            const reverse = this.smoothParam("reverse");
            const slicer = this.smoothParam("slicer");
            const stutter = this.smoothParam("stutter");
            const freeze = this.smoothParam("freeze");
            const spiral = this.smoothParam("spiral");
            const mobius = this.smoothParam("mobius");
            const gate = this.smoothParam("gate");
            const space = this.smoothParam("space");
            const pump = this.smoothParam("pump");
            const width = this.smoothParam("width");
            const frame = this.writeFrame;
            this.writeIndex = ((this.writeFrame % this.maxBuffer) + this.maxBuffer) % this.maxBuffer;
            this.maybeLatchStutter(stutter, frame);
            const noiseKickDuck = this.updateNoiseKickDuck(frame, noise);
            const pumpGain = this.updatePump(frame, pump);
            const rumbleEnv = this.updateRumble(frame, rumble);
            const gateGain = this.gateAmount(gate);
            const slicerGain = this.slicerAmount(slicer);
            const samples = [];

            for (let ch = 0; ch < output.length; ch += 1) {
                const channel = this.channels[ch] || this.channels[0];
                const source = input[ch] || input[0];
                let sample = source ? source[i] : 0;
                sample = this.softClip(sample, dirt, channel);
                sample = this.crush(sample, crush, channel);
                sample = this.ring(sample, ring, channel, ch);
                sample = this.rumble(sample, rumble, channel, ch, rumbleEnv);
                sample = this.noiseLayer(sample, noise, channel, ch, frame, noiseKickDuck, 1);
                sample = this.resonator(sample, reso, channel);
                sample = this.shift(sample, shift, channel, ch);
                sample = this.sweep(sample, sweep, channel, ch);
                channel.buffer[this.writeIndex] = sample;
                channel.bufferPrimedSamples = Math.min(this.maxBuffer, channel.bufferPrimedSamples + 1);
                sample = this.beatReverse(sample, reverse, channel);
                sample *= slicerGain;
                sample = this.stutter(sample, stutter, channel);
                sample = this.brake(sample, channel, this.targets.brake);
                sample = this.freeze(sample, freeze, channel, ch);
                sample = this.spiral(sample, spiral, channel);
                sample = this.mobius(sample, mobius, channel, ch);
                sample *= gateGain;
                sample = this.space(sample, space, channel, ch);
                sample *= pumpGain;
                samples[ch] = sample;
            }

            if (output.length > 1) {
                const widened = this.applyWidth(samples[0] || 0, samples[1] ?? samples[0] ?? 0, width);
                samples[0] = widened[0];
                samples[1] = widened[1];
            }

            for (let ch = 0; ch < output.length; ch += 1) {
                output[ch][i] = Math.max(-1, Math.min(1, samples[ch] || 0));
            }

            this.writeFrame += 1;
            this.writeIndex = ((this.writeFrame % this.maxBuffer) + this.maxBuffer) % this.maxBuffer;
            if (stutter > 0.015) this.repeatIndex = (this.repeatIndex + 1) % Math.max(1, this.repeatLength);
            this.phase += 1;
        }
        return true;
    }
}

registerProcessor("synthstream-insert-fx", SynthstreamInsertFx);
