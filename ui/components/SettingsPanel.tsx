import { h } from "../../vendor/preact.module.js";
import type { Actions, State } from "../../metronome/store.js";
import { InstallHint } from "./InstallHint.js";
import { ShareButton } from "./ShareButton.js";
import { SubdivisionControl } from "./SubdivisionControl.js";
import { SwingControl } from "./SwingControl.js";
import { ThemeToggle } from "./ThemeToggle.js";
import { UpdateRow } from "./UpdateRow.js";
import { VolumeControl } from "./VolumeControl.js";

export function SettingsPanel({
  state,
  actions,
}: {
  state: State;
  actions: Actions;
}) {
  const showInstall =
    state.touch && !state.standalone && !state.installDismissed;

  return (
    <div class="panel">
      <SubdivisionControl sub={state.sub} onChange={actions.setSub} />
      <SwingControl
        swing={state.swing}
        sub={state.sub}
        onChange={actions.setSwing}
      />
      <VolumeControl volume={state.volume} onChange={actions.setVolume} />
      {showInstall ? <InstallHint onDismiss={actions.dismissInstall} /> : null}
      <div class="actions">
        <ShareButton copied={state.copied} onShare={actions.share} />
        <ThemeToggle />
      </div>
      <UpdateRow />
    </div>
  );
}
