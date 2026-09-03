import { h } from "../vendor/preact.module.js";
import { useRef } from "../vendor/hooks.module.js";
import type { Store } from "../metronome/store.js";
import { BeatGrid } from "./components/BeatGrid.js";
import { PanelChevron } from "./components/PanelChevron.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { TempoControl } from "./components/TempoControl.js";
import { Transport } from "./components/Transport.js";
import { useStore } from "./hooks/useStore.js";
import { currentBeat } from "../metronome/store.js";

/* Sections take the whole `actions` bag because they drive several of them;
   the single-control components below them take one `onChange`. */
export function App({ store }: { store: Store }) {
  const state = useStore(store);
  const shell = useRef<HTMLDivElement>(null);

  if (state.unsupported) {
    return (
      <div class="unsupported">
        This metronome needs AudioWorklet, which this browser doesn’t support.
      </div>
    );
  }

  return (
    <div class="shell" ref={shell}>
      <div class="main">
        <BeatGrid
          beats={state.beats}
          current={currentBeat(state)}
          actions={store.actions}
        />
        <TempoControl
          bpm={state.bpm}
          bpmText={state.bpmText}
          actions={store.actions}
        />
        <Transport
          running={state.running}
          elapsed={state.elapsed}
          bars={state.bars}
          countIn={state.countIn}
          actions={store.actions}
        />
      </div>
      <SettingsPanel state={state} actions={store.actions} />
      <PanelChevron shell={shell} />
    </div>
  );
}
