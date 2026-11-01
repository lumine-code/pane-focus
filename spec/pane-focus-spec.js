describe("pane-focus", () => {
  let mainModule, mainWindow, container, workspaceElement;

  beforeEach(async () => {
    jasmine.useRealClock();
    workspaceElement = lumine.workspace.getElement();
    jasmine.attachToDOM(workspaceElement);
    mainWindow = lumine.workspace.getMainWindow();
    container = mainWindow.getEditorContainer();
    mainModule = (await lumine.packages.activatePackage("pane-focus")).mainModule;
  });

  afterEach(async () => {
    if (lumine.packages.isPackageActive("pane-focus")) {
      await lumine.packages.deactivatePackage("pane-focus");
    }
    await lumine.workspace.discardEditorWindows();
  });

  function controllerFor(editorWindow = mainWindow) {
    return mainModule.controllers.get(editorWindow);
  }

  function createColumns(localContainer = container) {
    const left = localContainer.getActivePane();
    const middle = left.splitRight({ activate: false });
    const right = middle.splitRight({ activate: false });
    const panes = [left, middle, right];
    const editors = panes.map((pane, index) => {
      const editor = lumine.workspace.buildTextEditor();
      editor.setText(`Column ${index + 1}`);
      pane.activateItem(editor);
      pane.setFlexScale(index + 1);
      return editor;
    });
    middle.activate();
    return { panes, editors, middle };
  }

  async function waitForExit(localContainer = container) {
    await waitForFrames(() => !localContainer.getElement().classList.contains("pane-focus"), {
      description: "pane focus presentation to finish restoring",
    });
  }

  function createDockItem(location) {
    const element = document.createElement("div");
    element.textContent = "Dock panel";
    element.tabIndex = -1;
    return {
      getElement: () => element,
      getTitle: () => "Dock panel",
      getAllowedLocations: () => [location],
    };
  }

  it("enlarges the existing pane without changing its layout, items or editor views", async () => {
    const { panes, editors, middle } = createColumns();
    const root = container.getRoot();
    const children = root.getChildren();
    const scales = panes.map((pane) => pane.getFlexScale());
    const paneElements = panes.map((pane) => pane.getElement());
    const editorElements = editors.map((editor) => editor.getElement());
    const originalParent = middle.getElement().parentElement;

    lumine.commands.dispatch(workspaceElement, "pane-focus:toggle");

    expect(controllerFor().pane).toBe(middle);
    expect(container.getElement().classList.contains("pane-focus")).toBeTrue();
    expect(middle.getElement().classList.contains("pane-focus-pane")).toBeTrue();
    expect(container.getRoot()).toBe(root);
    expect(root.getChildren()).toEqual(children);
    expect(panes.map((pane) => pane.getFlexScale())).toEqual(scales);
    expect(panes.map((pane) => pane.getItems())).toEqual(editors.map((editor) => [editor]));
    for (const [index, pane] of panes.entries()) {
      expect(pane.getElement()).toBe(paneElements[index]);
      expect(editors[index].getElement()).toBe(editorElements[index]);
      expect(editorElements[index].isConnected).toBeTrue();
    }

    editors[1].insertText(" edited while focused");
    lumine.commands.dispatch(workspaceElement, "pane-focus:toggle");
    await waitForExit();

    expect(controllerFor().pane).toBeNull();
    expect(middle.getElement().parentElement).toBe(originalParent);
    expect(container.getRoot()).toBe(root);
    expect(root.getChildren()).toEqual(children);
    expect(panes.map((pane) => pane.getFlexScale())).toEqual(scales);
    expect(panes.map((pane) => pane.getItems())).toEqual(editors.map((editor) => [editor]));
    expect(editors[1].getText()).toContain("edited while focused");
    expect(middle.getElement().classList.contains("pane-focus-pane")).toBeFalse();
    expect(container.getElement().querySelector(".pane-focus-backdrop")).toBeNull();
  });

  it("preserves both axes and their proportions in a nested layout", () => {
    const { middle } = createColumns();
    const lower = middle.splitDown({ activate: false });
    lower.activateItem(lumine.workspace.buildTextEditor());
    middle.activate();
    const root = container.getRoot();
    const nestedAxis = middle.getParent();
    nestedAxis.setFlexScale(1.7);
    middle.setFlexScale(0.4);
    lower.setFlexScale(1.6);
    const rootChildren = root.getChildren();
    const nestedChildren = nestedAxis.getChildren();
    const originalParent = middle.getElement().parentElement;

    controllerFor().enter();
    controllerFor().exit();

    expect(container.getRoot()).toBe(root);
    expect(root.getChildren()).toEqual(rootChildren);
    expect(nestedAxis.getChildren()).toEqual(nestedChildren);
    expect(nestedAxis.getFlexScale()).toBe(1.7);
    expect(middle.getFlexScale()).toBe(0.4);
    expect(lower.getFlexScale()).toBe(1.6);
    expect(middle.getElement().parentElement).toBe(originalParent);
  });

  it("consumes the backdrop click while restoring the focused pane", async () => {
    const { middle } = createColumns();
    controllerFor().enter();
    const backdrop = container.getElement().querySelector(".pane-focus-backdrop");
    const underlyingClick = jasmine.createSpy("underlying workspace click");
    workspaceElement.addEventListener("click", underlyingClick);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    try {
      backdrop.dispatchEvent(click);
      await waitForExit();
      expect(click.defaultPrevented).toBeTrue();
      expect(underlyingClick).not.toHaveBeenCalled();
      expect(controllerFor().pane).toBeNull();
      expect(container.getActivePane()).toBe(middle);
    } finally {
      workspaceElement.removeEventListener("click", underlyingClick);
    }
  });

  it("keeps focus mode when switching tabs inside the same pane", () => {
    const { middle } = createColumns();
    const secondEditor = lumine.workspace.buildTextEditor();
    middle.addItem(secondEditor);
    controllerFor().enter();

    middle.activateItem(secondEditor);

    expect(controllerFor().pane).toBe(middle);
    expect(middle.getActiveItem()).toBe(secondEditor);
    expect(middle.getElement().classList.contains("pane-focus-pane")).toBeTrue();
  });

  it("restores the layout when another center pane is explicitly activated", async () => {
    const { panes } = createColumns();
    controllerFor().enter();

    panes[0].activate();
    await waitForExit();

    expect(controllerFor().pane).toBeNull();
    expect(container.getActivePane()).toBe(panes[0]);
    expect(container.getPanes()).toEqual(panes);
  });

  it("retains focus mode and dock visibility while the user works in a dock", () => {
    const { middle } = createColumns();
    const dock = lumine.workspace.getBottomDock();
    const dockItem = createDockItem("bottom");
    dock.getActivePane().activateItem(dockItem);
    dock.show();
    middle.activate();
    controllerFor().enter();

    dock.activate();

    expect(controllerFor().pane).toBe(middle);
    expect(dock.isVisible()).toBeTrue();
    expect(dock.getActivePaneItem()).toBe(dockItem);
    expect(lumine.workspace.getActivePaneContainer()).toBe(dock);
  });

  it("navigates directly between the enlarged pane and its visible dock", async () => {
    workspaceElement.style.width = "1000px";
    workspaceElement.style.height = "600px";
    const { middle } = createColumns();
    const dock = lumine.workspace.getLeftDock();
    const dockItem = createDockItem("left");
    dock.getActivePane().activateItem(dockItem);
    dock.show();
    middle.activate();
    controllerFor().enter();
    await waitForFrames(() => dock.getActivePane().getElement().getBoundingClientRect().width > 0, {
      description: "visible dock to receive its layout",
    });

    lumine.commands.dispatch(middle.getElement(), "window:focus-pane-left");
    expect(lumine.workspace.getActivePaneContainer()).toBe(dock);
    expect(controllerFor().pane).toBe(middle);

    lumine.commands.dispatch(dockItem.getElement(), "window:focus-pane-right");
    expect(lumine.workspace.getActivePane()).toBe(middle);
    expect(controllerFor().pane).toBe(middle);

    dock.hide();
    lumine.commands.dispatch(middle.getElement(), "window:focus-pane-left");
    expect(lumine.workspace.getActivePane()).toBe(middle);
    expect(controllerFor().pane).toBe(middle);
  });

  it("restores the real pane and removes its presentation when deactivated", async () => {
    const { middle } = createColumns();
    const paneElement = middle.getElement();
    const originalParent = paneElement.parentElement;
    const retiredController = controllerFor();
    retiredController.enter();

    await lumine.packages.deactivatePackage("pane-focus");

    expect(retiredController.pane).toBeNull();
    expect(paneElement.parentElement).toBe(originalParent);
    expect(paneElement.classList.contains("pane-focus-pane")).toBeFalse();
    expect(container.getElement().classList.contains("pane-focus")).toBeFalse();
    expect(container.getElement().querySelector(".pane-focus-backdrop")).toBeNull();
    lumine.commands.dispatch(workspaceElement, "pane-focus:toggle");
    expect(container.getElement().classList.contains("pane-focus")).toBeFalse();

    mainModule = (await lumine.packages.activatePackage("pane-focus")).mainModule;
    expect(controllerFor()).not.toBe(retiredController);
    controllerFor().enter();
    expect(controllerFor().pane).toBe(middle);
  });

  it("focuses the pane named by the dispatch target even when another pane is active", () => {
    const { panes, middle } = createColumns();
    expect(container.getActivePane()).toBe(middle);

    lumine.commands.dispatch(panes[0].getActiveItem().getElement(), "pane-focus:toggle");

    expect(controllerFor().pane).toBe(panes[0]);
    expect(container.getActivePane()).toBe(panes[0]);
  });

  it("offers Focus Pane immediately after Detach Pane only on center pane surfaces", async () => {
    const { panes, editors, middle } = createColumns();
    const tabs = (await lumine.packages.activatePackage("tabs")).mainModule;
    const coreMenus = lumine.contextMenu.loadPlatformItems();
    const emptyPane = middle.splitDown({ activate: false });
    const bar = tabs.tabBarViews.get(middle);
    const tab = bar.tabForItem(editors[1]).element;
    const emptySurface = emptyPane.getElement().querySelector(".item-views");
    const dock = lumine.workspace.getBottomDock();
    dock.getActivePane().activateItem(createDockItem("bottom"));
    const dockBar = tabs.tabBarViews.get(dock.getActivePane());
    const rowsFor = (target) => lumine.contextMenu.templateForElement(target);
    const focusRowFor = (target) =>
      rowsFor(target).find((row) => row.command === "pane-focus:toggle");
    try {
      for (const target of [tab, bar.element, emptySurface]) {
        const rows = rowsFor(target);
        const focusIndex = rows.findIndex((row) => row.command === "pane-focus:toggle");
        const detachIndex = rows.findIndex((row) => row.command === "pane:detach");
        expect(detachIndex).toBeGreaterThanOrEqual(0);
        expect(focusIndex).toBe(detachIndex + 1);
        expect(rows[focusIndex].label).toBe("Focus Pane");
        expect(rows[focusIndex].type).toBeUndefined();
        expect(rows[focusIndex].checked).toBeUndefined();
        expect(lumine.commands.getCommandState("pane-focus:toggle", { target })).toBeNull();
      }
      expect(focusRowFor(editors[1].getElement())).toBeUndefined();
      expect(focusRowFor(dockBar.element)).toBeUndefined();

      middle.activate();
      controllerFor().enter();

      expect(lumine.commands.getCommandState("pane-focus:toggle", { target: tab })).toBeNull();
      expect(
        lumine.commands.getCommandState("pane-focus:toggle", {
          target: tabs.tabBarViews.get(panes[0]).element,
        }),
      ).toBeNull();
      expect(focusRowFor(tab).type).toBeUndefined();
      expect(focusRowFor(tab).checked).toBeUndefined();
    } finally {
      coreMenus.dispose();
    }
  });

  it("keeps commands local to their presentation window", async () => {
    const mainLayout = createColumns();
    const extraWindow = await lumine.workspace.openEditorWindow({ show: false });
    const extraContainer = extraWindow.getEditorContainer();
    const extraLayout = createColumns(extraContainer);
    lumine.commands.dispatch(mainWindow.getElement(), "pane-focus:toggle");
    expect(controllerFor().pane).toBe(mainLayout.middle);
    expect(controllerFor(extraWindow).pane).toBeNull();

    lumine.commands.dispatch(extraWindow.getElement(), "pane-focus:toggle");
    expect(controllerFor().pane).toBe(mainLayout.middle);
    expect(controllerFor(extraWindow).pane).toBe(extraLayout.middle);

    lumine.commands.dispatch(extraWindow.getElement(), "pane-focus:toggle");
    await waitForExit(extraContainer);
    expect(controllerFor().pane).toBe(mainLayout.middle);
    expect(controllerFor(extraWindow).pane).toBeNull();
  });
});
