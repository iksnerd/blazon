// Draws the slides as HTML for the browser to print. A slide is a box of 960 x 540 points, and everything on it is placed by its
// coordinates in points, measured from the bottom left as the Python deck's PDF library measured them, so each method here is the
// matching method of that deck. Text is placed by its baseline and set on one line: the lines are broken here, not by the browser,
// so the plan's fitting and the drawing agree.

export { Painter } from './painter.js';
export type { Resources } from './canvas.js';
