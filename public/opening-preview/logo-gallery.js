const logo = document.querySelector(".logo");
const select = document.querySelector("#choices");
const caption = document.querySelector("#caption");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const moves = [
  ["Soft rise", "translateY(14px)"],
  ["Gentle descent", "translateY(-28px)"],
  ["Slide from left", "translateX(-110px)"],
  ["Slide from right", "translateX(110px)"],
  ["Diagonal lift", "translate(-45px, 28px)"],
  ["Diagonal glide", "translate(50px, -26px)"],
  ["Coffee bean pop", "scale(.36)"],
  ["Close-up settle", "scale(1.65)"],
  ["Wide to narrow", "scaleX(1.55)"],
  ["Unfold upright", "scaleY(.08)"],
  ["Unfold sideways", "scaleX(.08)"],
  ["Tilt clockwise", "rotate(17deg) scale(.85)"],
  ["Tilt counterclockwise", "rotate(-17deg) scale(.85)"],
  ["Card flip", "perspective(450px) rotateX(-90deg)"],
  ["Door swing", "perspective(450px) rotateY(88deg)"],
  ["Skew settle", "skewX(-27deg) translateX(-24px)"],
  ["Elastic hop", "translateY(32px)", "translateY(-10px)"],
  ["Spring zoom", "scale(.58)", "scale(1.13)"],
  ["Pendulum", "rotate(-18deg)", "rotate(7deg)"],
  ["Reverse pendulum", "rotate(18deg)", "rotate(-7deg)"],
  ["Slide and rebound", "translateX(-85px)", "translateX(18px)"],
  ["Drop and bounce", "translateY(-45px)", "translateY(8px)"],
  ["Squash and stretch", "scale(.72, 1.45)", "scale(1.16, .82)"],
  ["Press release", "scale(1.2, .58)", "scale(.95, 1.09)"],
  ["Pour arc", "translate(-65px, -25px) rotate(-22deg)", "translate(12px, 7px) rotate(5deg)"],
];
const masks = [
  ["Left wipe", "inset(0 100% 0 0)"],
  ["Right wipe", "inset(0 0 0 100%)"],
  ["Top wipe", "inset(0 0 100% 0)"],
  ["Bottom wipe", "inset(100% 0 0 0)"],
  ["Center curtain", "inset(0 50% 0 50%)"],
  ["Horizontal slit", "inset(50% 0 50% 0)"],
  ["Center iris", "circle(0% at 50% 50%)", "circle(100% at 50% 50%)"],
  ["Left iris", "circle(0% at 0% 50%)", "circle(120% at 0% 50%)"],
  ["Right iris", "circle(0% at 100% 50%)", "circle(120% at 100% 50%)"],
  ["Corner iris", "circle(0% at 0% 100%)", "circle(120% at 0% 100%)"],
  ["Oval bloom", "ellipse(0% 0% at center)", "ellipse(72% 85% at center)"],
  ["Diamond reveal", "polygon(50% 50%,50% 50%,50% 50%,50% 50%)", "polygon(50% -60%,140% 50%,50% 160%,-40% 50%)"],
  ["Diagonal cut", "polygon(0 0,0 0,0 0,0 0)", "polygon(0 0,100% 0,100% 100%,0 100%)"],
  ["Opposite corner", "polygon(100% 100%,100% 100%,100% 100%,100% 100%)", "polygon(0 0,100% 0,100% 100%,0 100%)"],
  ["Soft focus", null, null, "blur(14px)"],
  ["Steam focus", null, null, "blur(9px) brightness(1.7)"],
  ["Ink development", null, null, "contrast(.15) brightness(1.5)"],
  ["Roast to color", null, null, "grayscale(1) sepia(1)"],
];
const specials = [
  ["Letterspacing settle", [{letterSpacing:".22em",opacity:0},{letterSpacing:"-.055em",opacity:1}]],
  ["Copper glow", [{color:"#e68a5a",textShadow:"0 0 24px #ff7043",opacity:0},{color:"#2b211c",textShadow:"none",opacity:1}]],
  ["Double heartbeat", [{transform:"scale(.8)",opacity:0},{transform:"scale(1.1)",opacity:1},{transform:"scale(.97)"},{transform:"scale(1.06)"},{transform:"scale(1)"}]],
  ["Side-to-side settle", [{transform:"translateX(-35px)",opacity:0},{transform:"translateX(15px)",opacity:1},{transform:"translateX(-6px)"},{transform:"translateX(0)"}]],
  ["Three-step stamp", [{transform:"translateY(-55px) scale(1.3)",opacity:0},{transform:"translateY(0) scale(1.05,.88)",opacity:1},{transform:"scale(1)"}]],
  ["Roll into place", [{transform:"translateX(-60px) rotate(-95deg)",opacity:0},{transform:"translateX(0) rotate(0)",opacity:1}]],
  ["Steam drift", [{transform:"translateY(38px) skewX(-10deg)",filter:"blur(9px)",opacity:0},{transform:"translateY(-7px) skewX(6deg)",filter:"blur(2px)",opacity:.8},{transform:"none",filter:"none",opacity:1}]],
];
const previews = [
  ...moves.map(([name, start, rebound]) => [name, [
    {transform:start,opacity:0},
    ...(rebound ? [{transform:rebound,opacity:1,offset:.68}] : []),
    {transform:"none",opacity:1},
  ]]),
  ...masks.map(([name,start,end,filter]) => [name, filter
    ? [{filter,opacity:.1},{filter:"none",opacity:1}]
    : [{clipPath:start},{clipPath:end || "inset(0 0 0 0)"}]]),
  ...specials,
];
let index = 0;
let animation;
for (const [i,[name]] of previews.entries()) select.add(new Option(`${i + 1} · ${name}`,i));
function show(next) {
  index = (next + previews.length) % previews.length;
  const [name, frames] = previews[index];
  caption.textContent = `${index + 1} / ${previews.length} · ${name}`;
  select.value = index;
  animation?.cancel();
  if (!reducedMotion.matches) animation = logo.animate(frames, {duration:850,easing:"cubic-bezier(.2,.75,.25,1)"});
}
document.querySelector("#prev").onclick = () => show(index - 1);
document.querySelector("#next").onclick = () => show(index + 1);
document.querySelector("#replay").onclick = () => show(index);
select.onchange = () => show(Number(select.value));
show(0);
