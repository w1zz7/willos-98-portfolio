"use client";

export function Sparkline({
  data,
  width = 120,
  height = 18,
  color = "#080",
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1 || 1);
  const points = data
    .map((v, i) => `${i * stepX},${height - ((v - min) / range) * height}`)
    .join(" ");

  const lastIdx = data.length - 1;
  const lastX = lastIdx * stepX;
  const lastY = height - ((data[lastIdx] - min) / range) * height;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1"
      />
      <circle cx={lastX} cy={lastY} r="1.5" fill={color} />
    </svg>
  );
}
