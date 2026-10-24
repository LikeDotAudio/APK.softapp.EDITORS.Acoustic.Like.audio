# 1 · Using Acoustic X

## The modules

| Window | Answers | Pass forward |
|---|---|---|
| **Modal Response** | Are the room's dimensions good for the bass? | $L, W, H$ (**Use these** also hands them to the host to draw) |
| **Speaker Boundary Interference Response** | Where do the speakers go? | speaker position, listening window, specular absorbers |
| **Ray Tracing** | How loud and how late is each reflection, and from where? | — |
| **Reverb Time** | How much of which material, and where? | — |
| **Calculator** | The bench sums | — |

The original passed results forward from module to module. Here every window shares one model ([README](README.md#the-classic-model)), so a result is visible everywhere as soon as it exists. The specular absorbers that SBIR places are also used by Ray Tracing.

## The three views

Every module window shows its results three ways, picked with the **Room View · Chart View · Data View** buttons above the right-hand side:

- **Room View** draws the room as a wire-frame with the module's own layers in it: pressure maps, the listening window and absorbers, ray traces and polar energy, or the surface being edited.
- **Chart View** shows the module's charts. The **Chart View Manager** under them reads out what the mouse is over and steps through results.
- **Data View** has the lists, the **Data View Manager** (sort and filter), and the module's report as it will print.

## The Room View Manager

`js/acoustx/roomView.js`. Every view is **orthographic**: parallel lines stay parallel, and one metre is the same length everywhere in the picture.

| View | Projection $P = (X, Y, Z) \mapsto (u, v)$, $v$ downward |
|---|---|
| Plan View | $(X,\; Y)$, the front wall at the top |
| Side Elevation | $(Y,\; -Z)$, the front wall on the left |
| End Elevation | $(X,\; -Z)$, looking at the front wall |
| 3-Dimensional | $\big((X - Y)\cos 30°,\; \tfrac{1}{2}(X + Y) - Z\big)$ |
| User View | see below |

**User View** turns the room about its centre $c = (W/2, L/2, H/2)$ by a yaw $\psi$ (about the vertical), then tips it by a pitch $\theta$. With $x = X - c_X$, $y = Y - c_Y$ and $z = Z - c_Z$:

$$x_1 = x\cos\psi - y\sin\psi, \qquad y_1 = x\sin\psi + y\cos\psi$$
$$u = x_1, \qquad v = y_1\sin\theta - z\cos\theta$$

At $\theta = 90°$ this is the plan; at $\theta = 0°$ it is an elevation. **Set** shows the arrows:

- In **R** mode they turn the view: ◄ ► change the yaw by 15°, and ▲ ▼ change the pitch by 10° (limited to ±90°).
- In **M** mode they move the view 20 px.
- **+** and **−** zoom by 1.2×, and **◎** resets.

Dragging on a user view also turns it, by 0.5° per pixel of yaw and 0.4° of pitch.

`fit` scales the eight corners of the box into the canvas with a 34 px margin, $k$ pixels per metre, then applies the user view's zoom and pan. Its inverse, $(u, v) = ((p_x - o_x)/k,\; (p_y - o_y)/k)$, is how a click on the Plan View becomes a classic $(X, Y)$ for Ray Tracing's **Mouse Edit**.

**Display Axis** (General Parameters) draws grey dashed lines: the centre listening axis, front wall to back at the listener's height, and each speaker's axis to the listener.

## Start screen, Fast Guide, reports

- The **Start Screen** has the module buttons (with the original's two blank "future use" buttons) and the **project lines**: description, client, location. They appear at the top of every Data View report and every printed or saved one.
- The **Fast Guide** gives five steps for whichever module window is in front, and changes when another comes to the front.
- The **Report Print Manager** selects the modules to report on (or all of them). **Preview** opens them in a window, and **Print** prints that window. **Export** saves them as HTML, CSV, tab-separated values or plain text. Every module builds one report object (`win.report()`) as sections of a heading, a paragraph and a table. The Data View shows that object, and each export format writes the same object.

## What is not carried over

- **Per-module save files:** the original's `.mdl`, `.sbr`, `.ray` and `.rtt` files aren't needed, because the app's session file holds the room.
- **Copy protection:** the original's licence-key scheme isn't reproduced.
- **Help menu:** its inactive items aren't reproduced either.
