describe("pane-focus soft-wrap resizing", () => {
  let controller, pane, editor, component, embedded;

  beforeEach(async () => {
    jasmine.useRealClock();
    lumine.config.set("core.destroyEmptyPanes", false);
    const workspaceElement = lumine.workspace.getElement();
    workspaceElement.style.width = "960px";
    workspaceElement.style.height = "640px";
    jasmine.attachToDOM(workspaceElement);
    const editorWindow = lumine.workspace.getMainWindow();
    const container = editorWindow.getEditorContainer();
    const left = container.getActivePane();
    pane = left.splitRight({ activate: false });
    pane.splitRight({ activate: false });
    editor = lumine.workspace.buildTextEditor();
    editor.setText("words that wrap as the pane changes width ".repeat(50));
    editor.setSoftWrapped(true);
    pane.activateItem(editor);
    pane.activate();
    const mainModule = (await lumine.packages.activatePackage("pane-focus")).mainModule;
    controller = mainModule.controllers.get(editorWindow);
    const center = container.getElement();
    center.style.setProperty("--pane-focus-duration", "1000ms");
    center.style.setProperty("--pane-focus-easing", "linear");
    const matchMedia = window.matchMedia.bind(window);
    spyOn(window, "matchMedia").and.callFake((query) =>
      query === "(prefers-reduced-motion: reduce)" ? { matches: false } : matchMedia(query),
    );
    component = editor.getElement().getComponent();
    await waitForFrames(
      () => component.hasInitialMeasurements && editor.getEditorWidthInChars() > 0,
      { description: "the soft-wrapped editor to settle at its original pane width" },
    );
    editor.update({ softWrapDebounceInterval: 1000 });
    embedded = document.createElement("iframe");
    Object.assign(embedded.style, {
      position: "absolute",
      width: "10px",
      height: "10px",
      pointerEvents: "auto",
    });
    pane.getElement().appendChild(embedded);
  });

  afterEach(async () => {
    if (lumine.packages.isPackageActive("pane-focus")) {
      await lumine.packages.deactivatePackage("pane-focus");
    }
    embedded?.remove();
  });

  function seek(progress) {
    const animation = controller.animation;
    animation.pause();
    animation.currentTime = Number(animation.effect.getTiming().duration) * progress;
    // Deliver the same real DOM size change the editor's ResizeObserver sees.
    component.didResize();
  }

  async function finish() {
    const animation = controller.animation;
    const finished = animation.finished;
    animation.finish();
    await finished;
    await Promise.resolve();
  }

  it("defers wrapping during the animation and flushes the final width when it ends", async () => {
    const sourceWidth = editor.getEditorWidthInChars();
    const sourceLines = editor.getScreenLineCount();
    controller.enter();

    seek(0.35);
    expect(editor.getEditorWidthInChars()).toBe(sourceWidth);
    expect(editor.getScreenLineCount()).toBe(sourceLines);
    expect(window.getComputedStyle(embedded).pointerEvents).toBe("auto");
    seek(0.75);
    expect(editor.getEditorWidthInChars()).toBe(sourceWidth);
    await finish();

    const focusedWidth = editor.getEditorWidthInChars();
    expect(focusedWidth).toBeGreaterThan(sourceWidth);
    expect(editor.getScreenLineCount()).toBeLessThan(sourceLines);

    controller.exit({ animate: true });
    seek(0.5);
    expect(editor.getEditorWidthInChars()).toBe(focusedWidth);
    await finish();

    expect(editor.getEditorWidthInChars()).toBeCloseTo(sourceWidth, 1);
    expect(editor.getScreenLineCount()).toBe(sourceLines);
  });

  it("rewraps intermediate animation widths when the configured interval is zero", () => {
    editor.update({ softWrapDebounceInterval: 0 });
    const sourceWidth = editor.getEditorWidthInChars();
    const sourceLines = editor.getScreenLineCount();
    controller.enter();

    seek(0.5);

    expect(editor.getEditorWidthInChars()).toBeGreaterThan(sourceWidth);
    expect(editor.getScreenLineCount()).toBeLessThan(sourceLines);
  });

  it("keeps wrapping deferred across reversals and releases it after forced restoration", () => {
    const sourceWidth = editor.getEditorWidthInChars();
    controller.enter();
    seek(0.6);
    expect(editor.getEditorWidthInChars()).toBe(sourceWidth);

    controller.toggle();
    seek(0.4);
    expect(editor.getEditorWidthInChars()).toBe(sourceWidth);
    controller.toggle();
    seek(0.2);
    expect(editor.getEditorWidthInChars()).toBe(sourceWidth);

    controller.exit();
    expect(editor.getEditorWidthInChars()).toBeCloseTo(sourceWidth, 1);
    pane.setFlexScale(2);
    component.didResize();
    expect(editor.getEditorWidthInChars()).toBeGreaterThan(sourceWidth);
  });

  it("does not leave ordinary resizing deferred when a pane cannot be presented", () => {
    const sourceWidth = editor.getEditorWidthInChars();
    spyOn(controller.container, "presentPane").and.throwError("Presentation interrupted");

    expect(() => controller.enter()).toThrowError("Presentation interrupted");
    pane.setFlexScale(2);
    component.didResize();

    expect(editor.getEditorWidthInChars()).toBeGreaterThan(sourceWidth);
  });
});
