const { CompositeDisposable } = require("lumine");

class PaneFocusController {
  constructor(editorWindow) {
    this.window = editorWindow;
    this.container = editorWindow.getEditorContainer();
    this.center = this.container.getElement();
    this.pane = null;
    this.presentation = null;
    this.animation = null;
    this.backdropAnimation = null;
    this.exiting = false;
  }

  canToggle(pane = this.container.getActivePane()) {
    return Boolean(
      !this.disposed &&
      !this.window.isDestroyed() &&
      this.container.isAlive() &&
      pane?.isAlive() &&
      pane.getContainer() === this.container &&
      this.center.isConnected &&
      this.center.contains(pane.getElement()),
    );
  }

  toggle(pane = this.container.getActivePane()) {
    if (this.pane === pane && !this.exiting) this.exit({ animate: true });
    else if (this.pane === pane) this.enter(pane);
    else {
      this.exit();
      this.enter(pane);
    }
  }

  enter(pane = this.container.getActivePane()) {
    if (this.pane) {
      if (this.pane === pane && this.exiting) this.transitionTo(true);
      return;
    }
    if (!this.canToggle(pane)) return;
    this.cancelAnimation();
    const element = pane.getElement();
    const center = this.container.getElement();
    const originalBounds = element.getBoundingClientRect();
    this.beginResizeSession();
    let presentation;
    try {
      presentation = this.container.presentPane(pane);
    } catch (error) {
      this.endResizeSession();
      throw error;
    }
    this.pane = pane;
    this.presentation = presentation;
    this.center = center;

    center.classList.add("pane-focus");
    element.classList.add("pane-focus-pane");
    const backdrop = center.ownerDocument.createElement("div");
    backdrop.className = "pane-focus-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    this.backdrop = backdrop;
    const consume = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    backdrop.addEventListener("mousedown", consume);
    backdrop.addEventListener("contextmenu", consume);
    backdrop.addEventListener("click", (event) => {
      consume(event);
      if (event.button === 0) this.exit({ animate: true });
    });
    center.appendChild(backdrop);

    this.updateGeometry();
    this.resizeObserver = new center.ownerDocument.defaultView.ResizeObserver(() =>
      this.updateGeometry(),
    );
    // Equal-sized panels or docks can swap sides without resizing the center.
    // Their layout containers still change size, so observe the surrounding
    // branches as well as the center itself, in this presentation window only.
    for (let branch = center; branch; branch = branch.parentElement) {
      this.resizeObserver.observe(branch);
      if (branch === this.window.getElement()) break;
      for (const sibling of branch.parentElement?.children ?? []) {
        if (sibling !== branch) this.resizeObserver.observe(sibling);
      }
    }
    this.resize = () => this.updateGeometry();
    center.ownerDocument.defaultView.addEventListener("resize", this.resize);
    this.focusSubscriptions = new CompositeDisposable(
      presentation.onDidDispose(() => this.clearPresentation()),
    );
    this.transitionTo(true, { from: originalBounds, opacity: 0 });
    this.changed();
  }

  updateGeometry() {
    if (!this.pane) return;
    const bounds = this.center.getBoundingClientRect();
    const names = ["left", "top", "width", "height"];
    if (names.every((name) => this.centerBounds?.[name] === bounds[name])) return;
    const from = this.animation ? this.pane.getElement().getBoundingClientRect() : null;
    const opacity = this.animation ? this.backdropOpacity() : null;
    this.centerBounds = bounds;
    for (const [name, value] of Object.entries({
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    })) {
      this.center.style.setProperty(`--pane-focus-${name}`, `${value}px`);
    }
    if (from) this.transitionTo(!this.exiting, { from, opacity });
  }

  exit({ animate = false } = {}) {
    if (!this.presentation) return;
    if (!animate) this.presentation.dispose();
    else if (!this.exiting) this.transitionTo(false);
  }

  clearPresentation() {
    const element = this.pane?.getElement();
    this.cancelAnimation();
    this.resizeObserver?.disconnect();
    this.center?.ownerDocument.defaultView.removeEventListener("resize", this.resize);
    this.focusSubscriptions?.dispose();
    element?.classList.remove("pane-focus-pane");
    this.backdrop?.remove();
    this.center?.classList.remove("pane-focus");
    for (const name of ["left", "top", "width", "height"]) {
      this.center?.style.removeProperty(`--pane-focus-${name}`);
    }
    this.pane = null;
    this.presentation = null;
    this.backdrop = null;
    this.focusSubscriptions = null;
    this.resizeObserver = null;
    this.centerBounds = null;
    this.exiting = false;
    this.endResizeSession();
    this.changed();
  }

  changed() {
    lumine.commands.invalidateAvailability();
  }

  animationTiming() {
    const styles = this.center.ownerDocument.defaultView.getComputedStyle(this.center);
    const durationValue = styles.getPropertyValue("--pane-focus-duration").trim();
    return {
      duration: parseFloat(durationValue) * (durationValue.endsWith("ms") ? 1 : 1000),
      easing: styles.getPropertyValue("--pane-focus-easing").trim() || "ease-out",
    };
  }

  backdropOpacity() {
    return parseFloat(
      this.center.ownerDocument.defaultView.getComputedStyle(this.backdrop).opacity,
    );
  }

  beginResizeSession() {
    if (this.resizeSession) return;
    const browserWindow = this.center.ownerDocument.defaultView;
    const { duration } = this.animationTiming();
    if (
      browserWindow.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !Number.isFinite(duration) ||
      duration <= 0
    )
      return;
    this.resizeSession = lumine.workspace.beginLayoutResize();
  }

  endResizeSession() {
    const session = this.resizeSession;
    this.resizeSession = null;
    session?.dispose();
  }

  transitionTo(focused, { from, opacity } = {}) {
    if (!this.presentation) return;
    const presentation = this.presentation;
    const element = this.pane.getElement();
    const browserWindow = element.ownerDocument.defaultView;
    // Sample the visible frame before cancelling an interrupted transition.
    // Its current rectangle becomes the next animation's exact first frame.
    from ??= element.getBoundingClientRect();
    opacity ??= this.backdropOpacity();
    const timing = this.animationTiming();
    this.beginResizeSession();
    this.cancelAnimation();
    this.exiting = !focused;
    const target = focused
      ? element.getBoundingClientRect()
      : presentation.slot.getBoundingClientRect();
    if (
      browserWindow.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !from.width ||
      !from.height ||
      !target.width ||
      !target.height ||
      !Number.isFinite(timing.duration) ||
      timing.duration <= 0
    ) {
      if (!focused) presentation.dispose();
      else this.endResizeSession();
      return;
    }

    const frame = (bounds) => ({
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
    });
    // Animate the real border box. Editors reflow at the actual width instead
    // of having their destination layout squeezed by a scale transform.
    const animation = element.animate([frame(from), frame(target)], { ...timing, fill: "both" });
    this.animation = animation;
    const targetOpacity = focused ? this.backdropOpacity() : 0;
    this.backdropAnimation = this.backdrop.animate([{ opacity }, { opacity: targetOpacity }], {
      ...timing,
      fill: "both",
    });
    animation.finished.then(
      () => {
        if (this.animation !== animation || this.presentation !== presentation) return;
        if (focused) {
          this.cancelAnimation();
          this.endResizeSession();
        } else presentation.dispose();
      },
      () => {},
    );
  }

  cancelAnimation() {
    this.animation?.cancel();
    this.backdropAnimation?.cancel();
    this.animation = null;
    this.backdropAnimation = null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.exit();
    this.cancelAnimation();
    this.endResizeSession();
  }
}

module.exports = PaneFocusController;
