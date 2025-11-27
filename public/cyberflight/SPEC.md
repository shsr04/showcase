
You are an expert in WebGL, GLSL, and interactive real‑time graphics for the web.

Task:
Create a flythrough simulation of a Blade-Runner-style futuristic city.

Requirements:
- Implement everything in a single self-contained `index.html` file. All HTML, CSS, JavaScript, and shader code must be embedded directly in this file.
- Do not load any external scripts, styles, images, models, or other assets from the network or other files; the page must work completely offline when opened in a browser.
- Use a GPU-accelerated rendering pipeline (WebGL or WebGPU). All rendering and animation should be GPU-based, using GLSL (or a similar shading language) in vertex/fragment shaders rather than CPU-side canvas drawing.
- Visual style: a realistic/cinematic noir take on a dense, Blade-Runner/Akira/Ghost-in-the-Shell-style futuristic city at night, with tall buildings, neon outlines and lights, emissive signs, and a strong atmospheric mood (fog, haze, and depth). Use a predominantly black base with neon colors (e.g., cyan/magenta/blue) shining and bleeding through the fog.
- Atmosphere: include distance-based fog, haze, and at least a simple approximation of bloom or glow around bright emissive areas to convey a high-quality cinematic look.
- City layout: build a visually rich, dense city with narrow canyons, trenches, and vertical layering. Include recognizable futuristic elements where suitable (e.g., roads, flying billboards, signs, structural details) and make the environment feel varied and non-repeating rather than obviously tiled.
- Camera: implement a free-flight camera with a fixed forward speed and snappy, responsive movement through the city (no rails or predefined path).
- Controls: support mouse-based look control only (yaw and pitch), preferably via pointer lock, with a responsive, low-latency feel. Keyboard movement is optional but not required; prioritize a compelling mouse-driven free-flight experience.
- Animation: ensure smooth, real-time animation on a typical desktop GPU, with a proper render loop tied to `requestAnimationFrame`.
- Canvas behavior: create a full-window canvas that automatically resizes with the browser window and adjusts the rendering accordingly.
- Code structure: keep the JavaScript organized into clear sections for initialization, input handling, render loop, and shader setup. Keep shader code readable and embedded via `<script type="x-shader/x-vertex">` / `<script type="x-shader/x-fragment">` or similar, or as template strings in JavaScript.
- Fallback: handle cases where WebGL/WebGPU is not available by showing a simple message in the page instead of failing silently.
- Audio: include an in-page, fully offline generative ambient audio engine (e.g., using the Web Audio API) that produces a fitting futuristic city soundscape (distant traffic, hums, subtle drones, etc.) without relying on any external audio files.
- Quality & performance: aim for maximum visual fidelity and rich atmosphere while still running smoothly on a medium-level laptop GPU. Render all visible geometry procedurally or via GPU-driven techniques in shaders (e.g., raymarching or instancing), minimizing CPU-side per-frame work.

Deliverable:
- Output only the full contents of the `index.html` file, ready to be saved and opened directly in a modern desktop browser.
