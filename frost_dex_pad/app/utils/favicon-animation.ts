let animFrame: number | null = null;

export function startFaviconAnimation(logoSrc: string) {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = logoSrc;

  const link =
    (document.querySelector("link[rel~='icon']") as HTMLLinkElement) ||
    document.createElement("link");
  link.rel = "icon";
  link.type = "image/png";
  document.head.appendChild(link);

  let tick = 0;

  function draw() {
    tick += 0.03;
    const glow = 0.35 + 0.3 * Math.sin(tick);

    ctx.clearRect(0, 0, size, size);

    ctx.save();
    ctx.shadowBlur = 10 + 8 * Math.sin(tick);
    ctx.shadowColor = `rgba(60,230,255,${glow})`;
    ctx.drawImage(img, 0, 0, size, size);
    ctx.restore();

    link.href = canvas.toDataURL("image/png");
    animFrame = requestAnimationFrame(draw);
  }

  img.onload = () => {
    if (animFrame !== null) cancelAnimationFrame(animFrame);
    draw();
  };

  img.onerror = () => {};
}

export function stopFaviconAnimation() {
  if (animFrame !== null) {
    cancelAnimationFrame(animFrame);
    animFrame = null;
  }
}
