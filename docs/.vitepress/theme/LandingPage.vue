<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useData, withBase } from 'vitepress';
import { VPNavBarSearch } from 'vitepress/theme';

const { site } = useData();
const copyStatus = ref<'idle' | 'copied' | 'error'>('idle');
const menuOpen = ref(false);
const base = computed(() => site.value.base);
let observer: IntersectionObserver | undefined;
let copyTimer: number | undefined;

if (typeof document !== 'undefined') document.documentElement.classList.add('reveal-ready');

function fallbackCopy(value: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Copy command was rejected');
}

async function copyInstall(): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText('npm install ffmpeg');
    else fallbackCopy('npm install ffmpeg');
    copyStatus.value = 'copied';
  } catch {
    copyStatus.value = 'error';
  }
  if (copyTimer) window.clearTimeout(copyTimer);
  copyTimer = window.setTimeout(() => (copyStatus.value = 'idle'), 1_800);
}

onMounted(() => {
  const revealElements = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    revealElements.forEach((element) => element.classList.add('is-visible'));
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) entry.target.classList.add('is-visible');
      }
    },
    { threshold: 0.18 },
  );
  revealElements.forEach((element) => observer?.observe(element));
});

onBeforeUnmount(() => {
  observer?.disconnect();
  if (copyTimer) window.clearTimeout(copyTimer);
});
</script>

<template>
  <div class="landing-shell">
    <a class="skip-link" href="#main-content">Skip to content</a>
    <header class="landing-nav">
      <a class="landing-brand" :href="base" aria-label="node-ffmpeg home">
        <span class="brand-glyph" aria-hidden="true"><i></i><i></i><i></i></span>
        <span>node-ffmpeg</span>
      </a>
      <button
        class="nav-toggle"
        type="button"
        :aria-expanded="menuOpen"
        aria-label="Toggle navigation"
        @click="menuOpen = !menuOpen"
      >
        <span></span><span></span>
      </button>
      <nav :class="['landing-links', { 'is-open': menuOpen }]" aria-label="Main navigation">
        <a :href="withBase('/guide/getting-started')">Guide</a>
        <a :href="withBase('/api/video')">API</a>
        <a :href="withBase('/cookbook/frames')">Cookbook</a>
        <a :href="withBase('/guide/migration')">Migration</a>
        <VPNavBarSearch class="landing-search" />
        <a class="github-link" href="https://github.com/damianociarla/node-ffmpeg">GitHub ↗</a>
      </nav>
    </header>

    <main id="main-content" tabindex="-1">
      <section class="hero-section">
        <div class="hero-grid" aria-hidden="true"></div>
        <div class="hero-copy">
          <p class="eyebrow hero-enter hero-enter-1">FFmpeg, without the shell games.</p>
          <h1 class="hero-enter hero-enter-2">
            Media pipelines.<br />
            <em>Typed end to end.</em>
          </h1>
          <p class="hero-summary hero-enter hero-enter-3">
            A modern Node.js interface for probing, transforming, and exporting media—with native
            promises, safe arguments, and zero runtime dependencies.
          </p>
          <div class="hero-actions hero-enter hero-enter-4">
            <a class="primary-action" :href="withBase('/guide/getting-started')">Start building</a>
            <button class="install-command" type="button" @click="copyInstall">
              <code>npm i ffmpeg</code>
              <span aria-live="polite">{{
                copyStatus === 'copied'
                  ? 'Copied'
                  : copyStatus === 'error'
                    ? 'Select & copy'
                    : 'Copy'
              }}</span>
            </button>
          </div>
        </div>

        <div class="hero-terminal hero-enter hero-enter-3" aria-label="Code example">
          <div class="terminal-meta">
            <span>transcode.ts</span>
            <span class="live-indicator"><i></i> Node 24</span>
          </div>
          <pre><code><span class="syntax-dim">import</span> ffmpeg <span class="syntax-dim">from</span> <span class="syntax-string">'ffmpeg'</span>

<span class="syntax-dim">const</span> video = <span class="syntax-dim">await</span> ffmpeg(input)

video.on(<span class="syntax-string">'progress'</span>, ({ percent }) =&gt; {
  console.log(<span class="syntax-accent">`${percent.toFixed(1)}%`</span>)
})

<span class="syntax-dim">await</span> video
  .setVideoCodec(<span class="syntax-string">'libx264'</span>)
  .setVideoSize(<span class="syntax-string">'1280x?'</span>, <span class="syntax-number">true</span>)
  .save(output)</code></pre>
          <div class="terminal-progress">
            <div class="progress-label"><span>encoding</span><strong>72.4%</strong></div>
            <div class="progress-track"><i></i></div>
            <div class="progress-stats"><span>00:01:42</span><span>2.3× realtime</span></div>
          </div>
        </div>

        <div class="hero-orbit" aria-hidden="true">
          <span>probe</span><span>decode</span><span>filter</span><span>encode</span>
        </div>
      </section>

      <section class="manifesto-section">
        <div class="manifesto-index">01 / PRINCIPLE</div>
        <div class="manifesto-copy reveal">
          <p>One focused abstraction.</p>
          <h2>Your arguments stay arguments.<br />Your media stays under control.</h2>
          <p class="manifesto-detail">
            No command interpolation. No bundled binary. No legacy promise library. Just a precise
            TypeScript API over the FFmpeg tools you already trust.
          </p>
        </div>
      </section>

      <section class="pipeline-section">
        <div class="section-heading reveal">
          <p class="eyebrow">One fluent pipeline</p>
          <h2>From source to artifact,<br />without losing the plot.</h2>
        </div>
        <div class="pipeline-rail">
          <article class="pipeline-step reveal">
            <span class="step-number">01</span>
            <div>
              <h3>Inspect</h3>
              <p>Structured ffprobe JSON, normalized into a stable typed model.</p>
            </div>
            <code>video.metadata</code>
          </article>
          <article class="pipeline-step reveal">
            <span class="step-number">02</span>
            <div>
              <h3>Compose</h3>
              <p>Chain codecs, dimensions, metadata, filters, and additional inputs.</p>
            </div>
            <code>.setVideoSize()</code>
          </article>
          <article class="pipeline-step reveal">
            <span class="step-number">03</span>
            <div>
              <h3>Observe</h3>
              <p>Track start, stderr, progress, completion, aborts, and failures.</p>
            </div>
            <code>.on('progress')</code>
          </article>
          <article class="pipeline-step reveal">
            <span class="step-number">04</span>
            <div>
              <h3>Deliver</h3>
              <p>Export safely through process arguments—never through a shell string.</p>
            </div>
            <code>await .save()</code>
          </article>
        </div>
      </section>

      <section class="proof-section">
        <div class="proof-statement reveal">
          <span>ZERO</span>
          <h2>runtime dependencies</h2>
        </div>
        <div class="proof-list reveal">
          <div>
            <span>01</span>
            <p>Native Promise and AbortSignal</p>
          </div>
          <div>
            <span>02</span>
            <p>ESM and CommonJS</p>
          </div>
          <div>
            <span>03</span>
            <p>First-party TypeScript types</p>
          </div>
          <div>
            <span>04</span>
            <p>Progress and lifecycle events</p>
          </div>
          <div>
            <span>05</span>
            <p>Remote protocol inputs</p>
          </div>
        </div>
      </section>

      <section class="compat-section">
        <div class="compat-copy reveal">
          <p class="eyebrow">A modern core, a familiar surface</p>
          <h2>Old code keeps moving.<br />New code feels native.</h2>
        </div>
        <div class="compat-code reveal">
          <div><span>Modern</span><code>const video = await create(input)</code></div>
          <div><span>Classic</span><code>const video = await new ffmpeg(input)</code></div>
          <div><span>Callback</span><code>new ffmpeg(input, (error, video) =&gt; {})</code></div>
        </div>
      </section>

      <section class="final-section">
        <div class="final-signal" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
        <div class="final-copy reveal">
          <p class="eyebrow">The next frame is yours</p>
          <h2>Build the pipeline.<br />Ship the media.</h2>
          <div class="final-actions">
            <a class="primary-action" :href="withBase('/guide/getting-started')">Read the guide</a>
            <a class="text-action" href="https://github.com/damianociarla/node-ffmpeg"
              >View source ↗</a
            >
          </div>
        </div>
      </section>
    </main>

    <footer class="landing-footer">
      <a class="landing-brand" :href="base"
        ><span class="brand-glyph"><i></i><i></i><i></i></span>node-ffmpeg</a
      >
      <p>MIT © Damiano Ciarla</p>
      <p>Built for Node 24.</p>
    </footer>
  </div>
</template>
