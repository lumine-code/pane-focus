module.exports = {
  version: 1,
  dependencies: ["language-javascript", "tree-view", "title-bar"],
  viewport: { width: 1200, height: 780 },
  async prepare({ lumine, open, fixture, state, command }) {
    await lumine.project.setPaths([fixture("Signal Board")]);
    await open("Signal Board/README.md");
    const left = lumine.workspace.getCenter().getActivePane();
    const middle = left.splitRight();
    await open("Signal Board/src/signals.js");
    middle.splitRight();
    await open("Signal Board/src/summary.js");
    middle.activate();
    state.middle = middle;
    command("tree-view:show");
  },
  scenes: [
    {
      id: "split-layout",
      file: "demo-layout.png",
      caption: "Keep notes, source and a summary in three columns.",
      run() {},
      ready({ lumine }) {
        return lumine.workspace.getCenter().getPanes().length === 3;
      },
    },
    {
      id: "focused-pane",
      file: "demo.png",
      caption: "Bring the active pane forward while preserving the split layout.",
      run({ command }) {
        command("pane-focus:toggle");
      },
      ready({ lumine, state }) {
        const center = lumine.workspace.getMainWindow().getEditorContainer();
        const element = state.middle.getElement();
        const bounds = element.getBoundingClientRect();
        const inset = parseFloat(
          getComputedStyle(center.getElement()).getPropertyValue("--pane-focus-inset"),
        );
        return (
          center.getPresentedPane() === state.middle &&
          Math.abs(bounds.width - (center.getElement().getBoundingClientRect().width - 2 * inset)) <
            1 &&
          element.getAnimations().length === 0
        );
      },
    },
  ],
};
