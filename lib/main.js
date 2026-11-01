const { CompositeDisposable } = require("lumine");
const PaneFocusController = require("./pane-focus-controller");

const centerPane = "lumine-pane:not(lumine-dock lumine-pane)";
const focusRow = (group, order, extra = {}) => ({
  label: "Focus Pane",
  command: "pane-focus:toggle",
  group,
  order,
  after: ["pane:detach"],
  ...extra,
});

module.exports = {
  activate() {
    this.controllers = new Map();
    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(
      lumine.workspace.observeWindows((editorWindow) => {
        this.ensureController(editorWindow);
      }),
      lumine.commands.add("lumine-workspace", {
        "pane-focus:toggle": {
          description: "Enlarge the active center pane while keeping its split layout.",
          isAvailable: (event) => {
            const controller = this.controllerFor(event.context);
            return Boolean(controller?.canToggle(this.paneFor(event.target, controller)));
          },
          didDispatch: (event) => {
            const controller = this.controllerFor(event.context);
            controller?.toggle(this.paneFor(event.target, controller));
          },
        },
      }),
      lumine.contextMenu.add({
        [`${centerPane} .tab`]: [focusRow("transfer", 31)],
        [`${centerPane} > .tab-bar`]: [
          focusRow("transfer", 31, {
            shouldDisplay: (event) => !event.target?.closest?.(".tab"),
          }),
        ],
        [`${centerPane} > .item-views:empty`]: [focusRow("close", 1)],
      }),
    );
  },

  ensureController(editorWindow) {
    let controller = this.controllers.get(editorWindow);
    if (controller) return controller;
    controller = new PaneFocusController(editorWindow);
    this.controllers.set(editorWindow, controller);
    const subscription = editorWindow.onDidDestroy(() => {
      controller.dispose();
      this.controllers.delete(editorWindow);
      this.subscriptions.remove(subscription);
      subscription.dispose();
    });
    this.subscriptions.add(subscription);
    return controller;
  },

  controllerFor(context) {
    const editorWindow =
      context?.window ?? lumine.workspace.getFocusedWindow() ?? lumine.workspace.getMainWindow();
    return this.controllers?.get(editorWindow);
  },

  paneFor(target, controller) {
    const pane = target?.closest?.("lumine-pane")?.getModel?.();
    return pane?.getContainer() === controller?.container
      ? pane
      : controller?.container.getActivePane();
  },

  provideBackgroundTips() {
    return {
      packageName: "pane-focus",
      tips: [
        "You can temporarily enlarge the active pane with {{ 'pane-focus:toggle' | keystroke }}",
      ],
    };
  },

  deactivate() {
    this.subscriptions?.dispose();
    for (const controller of this.controllers?.values() ?? []) controller.dispose();
    this.controllers?.clear();
    this.subscriptions = null;
  },
};
