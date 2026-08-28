import { useRef } from "../vendor/hooks.module.js";
import { html } from "./html.js";
import { BeatGrid } from "./components/BeatGrid.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { TempoControl } from "./components/TempoControl.js";
import { Transport } from "./components/Transport.js";
import { useStore } from "./hooks/useStore.js";
import { useViewport } from "./hooks/useViewport.js";
import { gridMetrics } from "./layout.js";
import { currentBeat } from "../metronome/store.js";

export function App({ store }) {
  const state = useStore(store);
  const shell = useRef(null);
  const { vw, vh } = useViewport(shell);

  if (state.unsupported) {
    return html`
      <div class="unsupported">
        This metronome needs AudioWorklet, which this browser doesn’t support.
      </div>
    `;
  }

  const metrics = gridMetrics(vw, vh, state.beats.length);
  /* The panel is the second scroll-snap page, so the chevron scrolls to it
     rather than toggling anything. */
  const toPanel = (e) => {
    const scroller = e.currentTarget.closest(".shell");
    if (scroller) scroller.scrollTo({ top: scroller.scrollHeight });
  };

  return html`
    <div class="shell" ref=${shell}>
      <div class="main">
        <${BeatGrid}
          beats=${state.beats}
          current=${currentBeat(state)}
          metrics=${metrics}
          onTap=${store.actions.cycleBeat}
          onResize=${store.actions.resizeBeats}
        />
        <${TempoControl}
          bpm=${state.bpm}
          bpmText=${state.bpmText}
          actions=${store.actions}
        />
        <${Transport}
          running=${state.running}
          elapsed=${state.elapsed}
          bars=${state.bars}
          countIn=${state.countIn}
          actions=${store.actions}
        />
        <button class="chevron" aria-label="More settings" onClick=${toPanel}>
          ⌄
        </button>
      </div>
      <${SettingsPanel} state=${state} actions=${store.actions} />
    </div>
  `;
}
