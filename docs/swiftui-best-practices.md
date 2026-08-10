# SwiftUI Best Practices

Portable rules — nothing here is specific to this app. Any SwiftUI project can adopt them as is;
the project's own implementation of each rule lives in [ios-guide.md](ios-guide.md).

## A CTA that fires a network call never waits in silence

**Any control that triggers a network call shows its state in the tap itself.** A button that looks
untouched while a request flies is a button the user taps again — duplicate writes, then a screen
that jumps with no explanation. Three shapes, in this order of preference:

### 1. Inline — the icon becomes the spinner

The default for every button that saves, renames, toggles or validates. A tiny reusable atom swaps
the SF Symbol for a `ProgressView`, so no call site re-implements the branch:

```swift
/// An SF Symbol that becomes a spinner while its action is in flight.
struct ActionIcon: View {
    let systemImage: String
    let isRunning: Bool

    var body: some View {
        if isRunning { ProgressView() } else { Image(systemName: systemImage) }
    }
}

Button {
    Task { await save() }
} label: {
    ActionIcon(systemImage: "checkmark", isRunning: isSaving)
}
.disabled(isSaving)
```

Rules that come with it:

- **One source of truth for "in flight."** If the action already runs through a helper that tracks
  its own state (an error presenter, a view model flag), bind the spinner to *that* — never a
  parallel `@State` boolean that can drift out of sync.
- **Refresh inside the in-flight window.** When success is followed by a reload, `await` the reload
  in the same closure rather than in a detached `Task`: otherwise the spinner stops before the view
  can redraw its new state, and the UI shows the old value for a beat.
- **`.interactiveDismissDisabled(isRunning)` on any sheet that writes.** A swipe mid-write orphans
  the task and leaves the user unsure whether anything was saved.
- **A row in a list carries its own spinner**, in its trailing edge — a form with several actions
  needs to say *which* one is running, so track the running action as an enum, not a boolean.

### 2. Long or AI work — the full-bleed loader

A multi-second wait (an LLM call, a heavy analysis) is not a button state: it owns the screen, with
a message saying what is being done. A dedicated loading screen also gives the failure a place to
land — a retry action in context instead of an alert over a frozen form.

### 3. One-way actions — optimistic, in the background

For an action the user cannot undo and has no reason to watch (deleting a row), the best loader is
none: leave the screen immediately, drop the row from the list, and let the call run in an object
that **outlives the view** — a store or view model, not a `Task` spawned by a screen that is about
to disappear (it survives, but it no longer has a view to report into). On failure, report the error
and reload the list, which puts the row back.

### Anti-patterns

- `.disabled(isRunning)` **without** a spinner — the feedback is invisible; the control just stops
  responding.
- An `alert` button that `await`s in silence: the alert dismisses and the screen freezes with no
  indication anything is happening. An alert cannot host a spinner — either move the work to a
  screen that can, or make it optimistic (shape 3).
- A `ProgressView` parked in a section unrelated to the control that was tapped — put it *on* the
  control.
- A spinner with no `.disabled`: it says "working" while still accepting a second tap.

## Every row of a form shares one leading edge

A marker column — a status dot, a drag handle, a checkmark — belongs to **all** the rows of a form
or to none of them. Give it only to the rows that can carry a marker and the labels of the same
section stop lining up: the `Toggle` sits on the standard inset, the marked field sits seven points
further in, and the eye reads the shift as a defect. Two ways out, and only these two:

- **The gutter is conditional, per screen.** When nothing on this screen can ever be marked, drop
  the column entirely — every label keeps SwiftUI's own inset, aligned with the section header.
  When something can, give the gutter to every row, marker or not.
- **Never** reserve it row by row. `if changed { dot }` inside one row and nothing in the next is
  the bug, not the fix.

Wrap the rows in one helper that owns the decision, so a row added later cannot forget it.

## `Stepper` — its label is not a tap target

`Stepper { label } onIncrement:onDecrement:` swallows the taps landing on its label. A `TextField`
put there renders correctly and **never takes focus**: the value becomes stepper-only, silently.
Keep the field outside and hide the stepper's own label:

```swift
HStack {
    LabeledContent(title) { TextField(title, text: $text) }
    Stepper("") { … } onDecrement: { … }
        .labelsHidden()
}
```

The control is still the native one — typing and stepping are both possible. A stepper over free
text also has to say what it does with text it cannot parse: move the leading number and keep the
rest as typed, and never silently do nothing.

## A row-wide button needs a shape, or its middle is dead

A `Button` whose label spreads content across a row — a title, a `Spacer`, a badge — is only
tappable **where something is drawn**. `.buttonStyle(.plain)` draws no background of its own, so
the gap the `Spacer` opens answers nothing: a tap between the title and the badge falls through to
the list, which does nothing. The row reads as tappable, and does nothing about half the time.

```swift
Button { select() } label: {
    HStack {
        Text(title)
        Spacer()
        Chip(text: badge)
    }
    // Without it, only the text and the chip take the tap.
    .contentShape(.rect)
}
.buttonStyle(.plain)
```

Give the shape to the row component itself rather than to each call site, so a third list built on
it cannot forget it. The same hole is closed by anything that fills the row — a `.background`, a
zero-opacity `NavigationLink` behind it — but a content shape says it in one line and costs nothing
to draw. Any hit-target rule is verified by tapping the row's **empty middle**, never its label:
that is the only tap the bug swallows.
