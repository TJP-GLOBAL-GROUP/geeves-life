/**
 * Geeves.Life Animated AI Agent Component
 * 
 * A custom web component that renders an animated constellation of nodes
 * representing the Geeves Life Operating System. The component supports
 * three cognitive states (resting, thinking, responding) with smooth
 * transitions, domain-aware coloring, and subtle audio feedback.
 * 
 * Usage:
 *   <geeves-agent size="320" dark-mode="true"></geeves-agent>
 * 
 * Attributes:
 *   - size: SVG viewBox size in pixels (default: 320)
 *   - dark-mode: "true" or "false" (default: true)
 *   - state: "resting" | "thinking" | "responding" (default: resting)
 *   - domain: "default" | "calendar" | "finance" | "family" | "security" | "wellbeing" | "home" | "business"
 * 
 * Events:
 *   - geeves-rest: Fired when agent returns to resting state
 *   - geeves-thinking: Fired when agent enters thinking state
 *   - geeves-respond: Fired when agent enters responding state
 * 
 * Methods:
 *   - setState(state, domain): Programmatically change state and optionally domain
 */

class GeevesAgent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    
    this._state = "resting";
    this._domain = "default";
    this._dark = true;
    this._size = 320;
    this._rendered = false;
    this._audioCtx = null;
    this._randomTimer = null;
    this._thinkingRAF = null;
    this._svg = null;
  }

  static get observedAttributes() {
    return ["state", "domain", "size", "dark-mode"];
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === "state") this._state = newVal;
    if (name === "domain") this._domain = newVal;
    if (name === "dark-mode") this._dark = newVal !== "false";
    if (name === "size") this._size = parseInt(newVal) || 320;
    if (this._rendered) this._applyTheme();
  }

  connectedCallback() {
    this._size = parseInt(this.getAttribute("size") || "320");
    this._dark = this.getAttribute("dark-mode") !== "false";
    this._render();
    this._rendered = true;
    this._startIdleLoop();
  }

  disconnectedCallback() {
    if (this._randomTimer) clearTimeout(this._randomTimer);
    if (this._thinkingRAF) cancelAnimationFrame(this._thinkingRAF);
  }

  get domains() {
    return {
      default: { color: "#E8943A", icon: "✦", label: "General" },
      calendar: { color: "#2AAFA9", icon: "◷", label: "Calendar" },
      finance: { color: "#D4A017", icon: "◈", label: "Finance" },
      family: { color: "#E8624A", icon: "♡", label: "Family" },
      security: { color: "#4F7EC4", icon: "⬡", label: "Security" },
      wellbeing: { color: "#8B5CF6", icon: "❋", label: "Wellbeing" },
      home: { color: "#4CAF7D", icon: "⌂", label: "Home" },
      business: { color: "#6B7A99", icon: "▦", label: "Business" },
    };
  }

  get currentDomain() {
    return this.domains[this._domain] || this.domains.default;
  }

  get formations() {
    return {
      resting: {
        apex: { x: 100, y: 22 },
        ul: { x: 44, y: 60 },
        ur: { x: 156, y: 60 },
        ll: { x: 44, y: 112 },
        lr: { x: 156, y: 112 },
        crown: { x: 100, y: 82 },
        principal: { x: 100, y: 140 },
      },
      thinking: {
        apex: { x: 100, y: 38 },
        ul: { x: 52, y: 52 },
        ur: { x: 148, y: 52 },
        ll: { x: 52, y: 148 },
        lr: { x: 148, y: 148 },
        crown: { x: 100, y: 100 },
        principal: { x: 100, y: 100 },
      },
      responding: {
        apex: { x: 100, y: 28 },
        ul: { x: 46, y: 58 },
        ur: { x: 154, y: 58 },
        ll: { x: 58, y: 120 },
        lr: { x: 142, y: 120 },
        crown: { x: 100, y: 78 },
        principal: { x: 100, y: 148 },
      },
    };
  }

  _render() {
    const d = this._dark;
    const bg = d ? "#1A1C20" : "#FAFAF8";
    const wm = d ? "#F8F7F4" : "#2D3139";
    const sub = "#8A8F9A";
    const dom = this.currentDomain;
    const S = this._size;

    const html = `
      <style>
        :host { display: inline-block; cursor: pointer; user-select: none; }
        svg { display: block; }
        .node { transition: filter 0.3s ease; }
        .node:hover { filter: brightness(1.3); }
        #principal-icon {
          font-size: 14px;
          text-anchor: middle;
          dominant-baseline: central;
          pointer-events: none;
        }
        .wm { font-family: 'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-weight: 700; }
        .tag { font-family: 'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-weight: 300; letter-spacing: 4px; }
      </style>

      <svg id="svg" width="${S}" height="${S}" viewBox="0 0 200 200"
           xmlns="http://www.w3.org/2000/svg">

        <rect id="bg" width="200" height="200" fill="${bg}" rx="16"/>

        <g id="lines" opacity="0.85" stroke-linecap="round" stroke-width="2.2">
          <line id="line-apex-ul"  stroke="#2AAFA9"/>
          <line id="line-apex-ur"  stroke="#2AAFA9"/>
          <line id="line-ul-ll"    stroke="#E8624A"/>
          <line id="line-ur-lr"    stroke="#D4A017"/>
          <line id="line-ll-archl" stroke="#8B5CF6"/>
          <line id="line-archr-lr" stroke="#4F7EC4"/>
          <path id="arch-path" fill="none" stroke="#2AAFA9" stroke-width="2.2" stroke-linecap="round"/>
          <line id="line-crown-base" stroke="#2AAFA9"/>
          <line id="line-base-principal" stroke="${dom.color}"/>
        </g>

        <g id="nodes">
          <circle id="node-apex"      class="node" r="5.5"  fill="#2AAFA9"/>
          <circle id="node-ul"        class="node" r="4.5"  fill="#E8624A"/>
          <circle id="node-ur"        class="node" r="4.5"  fill="#D4A017"/>
          <circle id="node-ll"        class="node" r="4.5"  fill="#8B5CF6"/>
          <circle id="node-lr"        class="node" r="4.5"  fill="#4F7EC4"/>
          <circle id="node-crown"     class="node" r="3.5"  fill="#2AAFA9"/>
          <circle id="node-principal" class="node" r="4.2"
                  fill="${bg}" stroke="${dom.color}" stroke-width="2.2"/>
          <text   id="principal-icon" fill="${dom.color}" font-size="5"
                  text-anchor="middle" dominant-baseline="central">${dom.icon}</text>
        </g>

        <text class="wm" x="100" y="172" text-anchor="middle"
              font-size="14" fill="${wm}">Geeves.<tspan fill="#2AAFA9">Life</tspan></text>
        <text class="tag" x="100" y="183" text-anchor="middle"
              font-size="5.5" fill="${sub}">OPERATING SYSTEM</text>

      </svg>
    `;

    if (this.shadowRoot) {
      this.shadowRoot.innerHTML = html;
      this._svg = this.shadowRoot.getElementById("svg");
      this._updatePositions(this.formations.resting, false);
      this._updateArch(this.formations.resting);
      this._svg?.addEventListener("click", () => this._onTap());
    }
  }

  _updatePositions(pos, animate = true) {
    const ids = ["apex", "ul", "ur", "ll", "lr", "crown", "principal"];
    ids.forEach((id) => {
      const el = this.shadowRoot?.getElementById(`node-${id}`);
      const p = pos[id];
      if (!el || !p) return;

      if (animate) {
        el.style.transition = "cx 0.8s cubic-bezier(0.23, 1, 0.32, 1), cy 0.8s cubic-bezier(0.23, 1, 0.32, 1)";
      }
      el.setAttribute("cx", p.x);
      el.setAttribute("cy", p.y);

      if (id === "principal") {
        const icon = this.shadowRoot?.getElementById("principal-icon");
        if (icon) {
          if (animate) icon.style.transition = "x 0.8s cubic-bezier(0.23, 1, 0.32, 1), y 0.8s cubic-bezier(0.23, 1, 0.32, 1)";
          icon.setAttribute("x", p.x);
          icon.setAttribute("y", p.y);
        }
      }
    });

    if (animate) {
      setTimeout(() => this._updateLines(pos), 200);
      setTimeout(() => this._updateArch(pos), 200);
    } else {
      this._updateLines(pos);
      this._updateArch(pos);
    }
  }

  _updateLines(pos) {
    const set = (id, x1, y1, x2, y2) => {
      const el = this.shadowRoot?.getElementById(id);
      if (!el) return;
      el.style.transition = "x1 0.6s cubic-bezier(0.23, 1, 0.32, 1), y1 0.6s cubic-bezier(0.23, 1, 0.32, 1), x2 0.6s cubic-bezier(0.23, 1, 0.32, 1), y2 0.6s cubic-bezier(0.23, 1, 0.32, 1)";
      el.setAttribute("x1", x1);
      el.setAttribute("y1", y1);
      el.setAttribute("x2", x2);
      el.setAttribute("y2", y2);
    };
    set("line-apex-ul", pos.apex.x, pos.apex.y, pos.ul.x, pos.ul.y);
    set("line-apex-ur", pos.apex.x, pos.apex.y, pos.ur.x, pos.ur.y);
    set("line-ul-ll", pos.ul.x, pos.ul.y, pos.ll.x, pos.ll.y);
    set("line-ur-lr", pos.ur.x, pos.ur.y, pos.lr.x, pos.lr.y);
    const archLx = pos.crown.x - (pos.lr.x - pos.ll.x) * 0.18;
    const archRx = pos.crown.x + (pos.lr.x - pos.ll.x) * 0.18;
    const baseY = pos.ll.y;
    set("line-ll-archl", pos.ll.x, baseY, archLx, baseY);
    set("line-archr-lr", archRx, baseY, pos.lr.x, baseY);
    set("line-crown-base", pos.crown.x, pos.crown.y, pos.crown.x, baseY);
    set("line-base-principal", pos.crown.x, baseY, pos.principal.x, pos.principal.y);
  }

  _updateArch(pos) {
    const el = this.shadowRoot?.getElementById("arch-path");
    if (!el) return;
    const lx = pos.crown.x - (pos.lr.x - pos.ll.x) * 0.18;
    const rx = pos.crown.x + (pos.lr.x - pos.ll.x) * 0.18;
    const fy = pos.ll.y;
    const r = (rx - lx) / 2;
    const k = r * 0.5523;
    const cx = (lx + rx) / 2;
    const curveY = fy - r;
    const topY = fy - 2 * r;
    const d = `M ${lx},${fy} L ${lx},${curveY} C ${lx},${curveY - k} ${cx - k},${topY} ${cx},${topY} C ${cx + k},${topY} ${rx},${curveY - k} ${rx},${curveY} L ${rx},${fy}`;
    el.style.transition = "d 0.8s cubic-bezier(0.23, 1, 0.32, 1)";
    el.setAttribute("d", d);
  }

  _applyTheme() {
    const bg = this._dark ? "#1A1C20" : "#FAFAF8";
    const bgEl = this.shadowRoot?.getElementById("bg");
    if (bgEl) bgEl.setAttribute("fill", bg);
    const principal = this.shadowRoot?.getElementById("node-principal");
    if (principal) principal.setAttribute("fill", bg);
  }

  setState(state, domain) {
    if (domain) this._domain = domain;
    this._state = state;

    const dom = this.currentDomain;
    const principal = this.shadowRoot?.getElementById("node-principal");
    const icon = this.shadowRoot?.getElementById("principal-icon");
    const stemLine = this.shadowRoot?.getElementById("line-base-principal");
    const lines = this.shadowRoot?.getElementById("lines");

    if (state === "resting") {
      this._updatePositions(this.formations.resting);
      if (lines) lines.style.opacity = "0.85";
      if (principal) {
        principal.setAttribute("fill", this._dark ? "#1A1C20" : "#FAFAF8");
        principal.setAttribute("stroke", dom.color);
        principal.setAttribute("stroke-width", "2.2");
      }
      if (icon) {
        icon.textContent = dom.icon;
        icon.setAttribute("fill", dom.color);
      }
      if (stemLine) stemLine.setAttribute("stroke", dom.color);
      this._playSound("rest");
      this._startIdleLoop();
      this.dispatchEvent(new CustomEvent("geeves-rest"));
    } else if (state === "thinking") {
      if (this._randomTimer) clearTimeout(this._randomTimer);
      this._playSound("thinking");
      this._updatePositions(this.formations.thinking);
      if (lines) lines.style.opacity = "0.3";
      if (principal) {
        principal.setAttribute("fill", dom.color);
        principal.setAttribute("stroke", dom.color);
      }
      if (icon) icon.textContent = dom.icon;
      this._thinkingLoop();
      this.dispatchEvent(new CustomEvent("geeves-thinking"));
    } else if (state === "responding") {
      this._stopThinkingLoop();
      this._playSound("respond");
      this._updatePositions(this.formations.responding);
      if (lines) lines.style.opacity = "1";
      if (principal) {
        principal.setAttribute("fill", dom.color);
        principal.setAttribute("stroke", dom.color);
      }
      if (icon) {
        icon.textContent = dom.icon;
        icon.setAttribute("fill", "#fff");
      }
      if (stemLine) stemLine.setAttribute("stroke", dom.color);
      this.dispatchEvent(new CustomEvent("geeves-respond"));
    }
  }

  _thinkingLoop() {
    this._stopThinkingLoop();
    const nodeIds = ["apex", "ul", "ur", "ll", "lr", "crown", "principal"];
    const center = { x: 100, y: 88 };
    const radii = [28, 38, 38, 38, 38, 18, 0];
    const speeds = [0.7, 0.5, -0.6, 0.4, -0.5, 0.9, 0];
    const offsets = [0, 1.0, 2.1, 3.2, 4.3, 5.4, 0];

    let start = null;
    const animate = (ts) => {
      if (!start) start = ts;
      const t = (ts - start) / 1000;
      nodeIds.forEach((id, i) => {
        const el = this.shadowRoot?.getElementById(`node-${id}`);
        if (!el) return;
        if (id === "principal") {
          const pulse = 1 + Math.sin(t * 2.5) * 0.15;
          el.setAttribute("r", (4.2 * pulse).toString());
          return;
        }
        const angle = offsets[i] + t * speeds[i];
        const nx = center.x + Math.cos(angle) * radii[i];
        const ny = center.y + Math.sin(angle) * radii[i] * 0.6;
        el.setAttribute("cx", nx.toString());
        el.setAttribute("cy", ny.toString());
      });
      this._thinkingRAF = requestAnimationFrame(animate);
    };
    this._thinkingRAF = requestAnimationFrame(animate);
  }

  _stopThinkingLoop() {
    if (this._thinkingRAF) {
      cancelAnimationFrame(this._thinkingRAF);
      this._thinkingRAF = null;
    }
  }

  _startIdleLoop() {
    if (this._randomTimer) clearTimeout(this._randomTimer);
    const delay = 8000 + Math.random() * 7000;
    this._randomTimer = setTimeout(() => {
      if (this._state === "resting") this._readinessPulse();
    }, delay);
  }

  _readinessPulse() {
    const principal = this.shadowRoot?.getElementById("node-principal");
    if (!principal) return;
    this._playSound("ping");
    principal.style.transition = "r 0.25s ease-out, stroke-width 0.25s ease-out";
    principal.setAttribute("r", "7");
    principal.setAttribute("stroke-width", "3");
    setTimeout(() => {
      principal.style.transition = "r 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), stroke-width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)";
      principal.setAttribute("r", "4.2");
      principal.setAttribute("stroke-width", "2.2");
    }, 250);
    const crown = this.shadowRoot?.getElementById("node-crown");
    if (crown) {
      crown.style.transition = "r 0.2s ease-out";
      crown.setAttribute("r", "5");
      setTimeout(() => {
        crown.style.transition = "r 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)";
        crown.setAttribute("r", "3.5");
      }, 200);
    }
    this._startIdleLoop();
  }

  _onTap() {
    if (this._state === "resting") {
      this.setState("thinking");
      setTimeout(() => this.setState("responding"), 2500);
      setTimeout(() => this.setState("resting"), 5000);
    } else if (this._state === "responding") {
      this.setState("resting");
    }
  }

  _getAudioCtx() {
    if (!this._audioCtx) {
      try {
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {}
    }
    return this._audioCtx;
  }

  _playTone(freq, duration, type = "sine", gain = 0.12, delay = 0) {
    const ctx = this._getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.connect(env);
    env.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    const t = ctx.currentTime + delay;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  _playSound(type) {
    if (type === "ping") {
      this._playTone(523, 0.3, "sine", 0.08);
    } else if (type === "thinking") {
      this._playTone(523, 0.25, "sine", 0.1);
      this._playTone(659, 0.25, "sine", 0.1, 0.15);
    } else if (type === "respond") {
      this._playTone(523, 0.2, "sine", 0.1);
      this._playTone(659, 0.2, "sine", 0.1, 0.12);
      this._playTone(784, 0.3, "sine", 0.12, 0.24);
    } else if (type === "rest") {
      this._playTone(392, 0.25, "sine", 0.07);
    }
  }
}

// Register the custom element if not already defined
if (!customElements.get("geeves-agent")) {
  customElements.define("geeves-agent", GeevesAgent);
}
