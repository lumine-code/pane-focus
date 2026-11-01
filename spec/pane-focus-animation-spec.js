describe("pane-focus animation geometry", () => {
  let controller, container, pane, otherPane, element, probe, originalParent;
  let originalBounds, focusedBounds, originalRoot;

  beforeEach(async () => {
    jasmine.useRealClock();
    lumine.config.set("core.destroyEmptyPanes", false);
    const workspaceElement = lumine.workspace.getElement();
    workspaceElement.style.width = "960px";
    workspaceElement.style.height = "640px";
    jasmine.attachToDOM(workspaceElement);
    const editorWindow = lumine.workspace.getMainWindow();
    container = editorWindow.getEditorContainer();
    otherPane = container.getActivePane();
    const middle = otherPane.splitRight({ activate: false });
    middle.splitRight({ activate: false });
    pane = middle.splitDown({ activate: false });
    const itemElement = document.createElement("div");
    probe = document.createElement("span");
    probe.textContent = "Native-size text";
    Object.assign(probe.style, {
      display: "inline-block",
      whiteSpace: "nowrap",
      fontSize: "14px",
      lineHeight: "20px",
    });
    itemElement.appendChild(probe);
    pane.activateItem({
      getElement: () => itemElement,
      getTitle: () => "Animation geometry",
    });
    pane.activate();
    const mainModule = (await lumine.packages.activatePackage("pane-focus")).mainModule;
    controller = mainModule.controllers.get(editorWindow);
    const center = container.getElement();
    center.style.setProperty("--pane-focus-inset", "24px");
    center.style.setProperty("--pane-focus-duration", "1000ms");
    center.style.setProperty("--pane-focus-easing", "linear");
    center.style.setProperty("--overlay-backdrop-opacity", "0.42");
    const matchMedia = window.matchMedia.bind(window);
    spyOn(window, "matchMedia").and.callFake((query) =>
      query === "(prefers-reduced-motion: reduce)" ? { matches: false } : matchMedia(query),
    );
    element = pane.getElement();
    await waitForFrames(() => element.getBoundingClientRect().height > 0, {
      description: "nested source pane to receive its layout",
    });
    originalParent = element.parentElement;
    originalRoot = container.getRoot();
    originalBounds = boundsFor(element);
    const centerBounds = boundsFor(center);
    focusedBounds = {
      left: centerBounds.left + 24,
      top: centerBounds.top + 24,
      width: centerBounds.width - 48,
      height: centerBounds.height - 48,
    };
  });

  afterEach(async () => {
    if (lumine.packages.isPackageActive("pane-focus")) {
      await lumine.packages.deactivatePackage("pane-focus");
    }
  });

  function boundsFor(target) {
    const { left, top, width, height } = target.getBoundingClientRect();
    return { left, top, width, height };
  }

  function halfway(from, to) {
    return Object.fromEntries(
      Object.keys(from).map((coordinate) => [coordinate, (from[coordinate] + to[coordinate]) / 2]),
    );
  }

  function expectBounds(actual, expected) {
    for (const coordinate of ["left", "top", "width", "height"]) {
      expect(actual[coordinate]).withContext(coordinate).toBeCloseTo(expected[coordinate], 1);
    }
  }

  function seek(animation, progress) {
    animation.pause();
    animation.currentTime = Number(animation.effect.getTiming().duration) * progress;
    const backdrop = controller.backdropAnimation;
    if (animation === controller.animation && backdrop) {
      backdrop.pause();
      backdrop.currentTime = Number(backdrop.effect.getTiming().duration) * progress;
    }
    return boundsFor(element);
  }

  function backdropOpacity() {
    return parseFloat(window.getComputedStyle(controller.backdrop).opacity);
  }

  async function finish(animation) {
    const finished = animation.finished;
    animation.finish();
    await finished;
    await Promise.resolve();
  }

  it("moves and resizes the real source rectangle without scaling its text", async () => {
    const originalTextHeight = probe.getBoundingClientRect().height;
    controller.enter();
    const animation = controller.animation;
    expect(animation).not.toBeNull();
    expectBounds(seek(animation, 0), originalBounds);
    expect(backdropOpacity()).toBeCloseTo(0, 3);
    expectBounds(seek(animation, 0.5), halfway(originalBounds, focusedBounds));
    expect(backdropOpacity()).toBeCloseTo(0.21, 3);
    expect(window.getComputedStyle(element).transform).toBe("none");
    expect(probe.getBoundingClientRect().height).toBeCloseTo(originalTextHeight, 1);
    expectBounds(seek(animation, 1), focusedBounds);
    expect(backdropOpacity()).toBeCloseTo(0.42, 3);
    await finish(animation);

    expectBounds(boundsFor(element), focusedBounds);
    expect(controller.pane).toBe(pane);
    expect(container.getRoot()).toBe(originalRoot);
    expect(pane.getElement()).toBe(element);
    expect(controller.animation).toBeNull();
    expect(backdropOpacity()).toBeCloseTo(0.42, 3);
  });

  it("returns from the floating rectangle to its original slot before releasing the presentation", async () => {
    controller.enter();
    await finish(controller.animation);

    controller.exit({ animate: true });
    const animation = controller.animation;
    expect(controller.exiting).toBeTrue();
    expect(controller.pane).toBe(pane);
    expectBounds(seek(animation, 0), focusedBounds);
    expect(backdropOpacity()).toBeCloseTo(0.42, 3);
    expectBounds(seek(animation, 0.5), halfway(focusedBounds, originalBounds));
    expect(backdropOpacity()).toBeCloseTo(0.21, 3);
    expect(window.getComputedStyle(element).transform).toBe("none");
    expectBounds(seek(animation, 1), originalBounds);
    expect(backdropOpacity()).toBeCloseTo(0, 3);
    await finish(animation);

    expect(controller.pane).toBeNull();
    expect(controller.presentation).toBeNull();
    expect(element.parentElement).toBe(originalParent);
    expectBounds(boundsFor(element), originalBounds);
    expect(container.getRoot()).toBe(originalRoot);
    expect(container.getElement().querySelector(".pane-focus-backdrop")).toBeNull();
  });

  it("reverses an unfinished entrance from the rectangle currently on screen", async () => {
    controller.enter();
    const interruptedBounds = seek(controller.animation, 0.5);
    const interruptedOpacity = backdropOpacity();

    controller.toggle();
    const returning = controller.animation;

    expect(controller.exiting).toBeTrue();
    expectBounds(seek(returning, 0), interruptedBounds);
    expect(backdropOpacity()).toBeCloseTo(interruptedOpacity, 3);
    expectBounds(seek(returning, 0.5), halfway(interruptedBounds, originalBounds));
    expect(backdropOpacity()).toBeCloseTo(interruptedOpacity / 2, 3);
    expectBounds(seek(returning, 1), originalBounds);
    await finish(returning);

    expect(controller.pane).toBeNull();
    expect(element.parentElement).toBe(originalParent);
    expectBounds(boundsFor(element), originalBounds);
  });

  it("reverses an unfinished return without jumping or recreating the pane", async () => {
    controller.enter();
    await finish(controller.animation);
    controller.exit({ animate: true });
    const interruptedBounds = seek(controller.animation, 0.5);
    const interruptedOpacity = backdropOpacity();

    controller.toggle();
    const entering = controller.animation;

    expect(controller.exiting).toBeFalse();
    expectBounds(seek(entering, 0), interruptedBounds);
    expect(backdropOpacity()).toBeCloseTo(interruptedOpacity, 3);
    expectBounds(seek(entering, 0.5), halfway(interruptedBounds, focusedBounds));
    expect(backdropOpacity()).toBeCloseTo((interruptedOpacity + 0.42) / 2, 3);
    expectBounds(seek(entering, 1), focusedBounds);
    expect(backdropOpacity()).toBeCloseTo(0.42, 3);
    await finish(entering);

    expect(controller.pane).toBe(pane);
    expect(pane.getElement()).toBe(element);
    expectBounds(boundsFor(element), focusedBounds);
    expect(backdropOpacity()).toBeCloseTo(0.42, 3);
    expect(container.getElement().querySelectorAll(".pane-focus-backdrop").length).toBe(1);
    expect(container.getElement().querySelectorAll(".pane-presentation-slot").length).toBe(1);
  });

  it("cancels an animation immediately when another pane becomes active", async () => {
    controller.enter();
    const cancelled = controller.animation;
    seek(cancelled, 0.5);

    otherPane.activate();

    expect(controller.pane).toBeNull();
    expect(controller.animation).toBeNull();
    expect(cancelled.playState).toBe("idle");
    expect(element.parentElement).toBe(originalParent);
    expectBounds(boundsFor(element), originalBounds);
    pane.activate();
    controller.enter();
    const current = controller.animation;
    current.pause();
    await Promise.resolve();
    expect(controller.pane).toBe(pane);
    expect(controller.animation).toBe(current);
    await finish(current);
    expectBounds(boundsFor(element), focusedBounds);
  });

  it("follows a center position change when equal-width docks swap sides", async () => {
    const leftDock = lumine.workspace.getLeftDock();
    const rightDock = lumine.workspace.getRightDock();
    leftDock.show();
    controller.enter();
    await finish(controller.animation);
    let frames = 0;
    await waitForFrames(() => ++frames === 2, {
      description: "the initial center resize observation to finish",
    });
    const before = boundsFor(container.getElement());

    leftDock.hide();
    rightDock.show();
    await waitForFrames(
      () => {
        const center = boundsFor(container.getElement());
        return (
          center.left !== before.left && Math.abs(boundsFor(element).left - center.left - 24) < 0.05
        );
      },
      { description: "floating pane to follow a center moved by equal-width docks" },
    );

    const after = boundsFor(container.getElement());
    expect(after.width).toBeCloseTo(before.width, 1);
    expect(after.height).toBeCloseTo(before.height, 1);
    expectBounds(boundsFor(element), {
      left: after.left + 24,
      top: after.top + 24,
      width: after.width - 48,
      height: after.height - 48,
    });
  });

  it("follows a center position change when equal-height header and footer panels swap", async () => {
    const editorWindow = container.getWindow();
    const makePanelContent = () => {
      const content = document.createElement("div");
      content.style.height = "30px";
      return content;
    };
    const header = editorWindow.addHeaderPanel({ item: makePanelContent() });
    const footer = editorWindow.addFooterPanel({ item: makePanelContent(), visible: false });
    try {
      controller.enter();
      await finish(controller.animation);
      let frames = 0;
      await waitForFrames(() => ++frames === 2, {
        description: "the initial surrounding layout observations to finish",
      });
      const before = boundsFor(container.getElement());

      header.hide();
      footer.show();
      await waitForFrames(
        () => {
          const center = boundsFor(container.getElement());
          return (
            center.top !== before.top && Math.abs(boundsFor(element).top - center.top - 24) < 0.05
          );
        },
        { description: "floating pane to follow a center moved by equal-height panels" },
      );

      const after = boundsFor(container.getElement());
      expect(after.width).toBeCloseTo(before.width, 1);
      expect(after.height).toBeCloseTo(before.height, 1);
      expectBounds(boundsFor(element), {
        left: after.left + 24,
        top: after.top + 24,
        width: after.width - 48,
        height: after.height - 48,
      });
    } finally {
      controller.exit();
      header.destroy();
      footer.destroy();
    }
  });

  it("enters and restores immediately when reduced motion is preferred", () => {
    window.matchMedia.and.callFake((query) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
    }));

    controller.enter();

    expect(controller.animation).toBeNull();
    expect(controller.backdropAnimation).toBeNull();
    expectBounds(boundsFor(element), focusedBounds);
    expect(backdropOpacity()).toBeCloseTo(0.42, 3);

    controller.exit({ animate: true });

    expect(controller.pane).toBeNull();
    expect(element.parentElement).toBe(originalParent);
    expectBounds(boundsFor(element), originalBounds);
    expect(container.getElement().querySelector(".pane-focus-backdrop")).toBeNull();
  });
});
