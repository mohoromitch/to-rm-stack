export const DEVICES = [
  {
    id: "rm2",
    name: "reMarkable 2 / reMarkable 1",
    widthPx: 1404,
    heightPx: 1872,
    ppi: 226,
    marginPt: 18,
    fontSizePt: 11,
  },
  {
    id: "rmpp",
    name: "reMarkable Paper Pro",
    widthPx: 1620,
    heightPx: 2160,
    ppi: 229,
    marginPt: 20,
    fontSizePt: 11,
  },
  {
    id: "rmppm",
    name: "reMarkable Paper Pro Move",
    widthPx: 954,
    heightPx: 1696,
    ppi: 264,
    marginPt: 10,
    fontSizePt: 10,
  },
];

export const DEFAULT_DEVICE_ID = "rm2";

export function deviceById(id) {
  return DEVICES.find((d) => d.id === id) ?? DEVICES.find((d) => d.id === DEFAULT_DEVICE_ID);
}

export function pageSizePt(device) {
  return {
    width: (device.widthPx / device.ppi) * 72,
    height: (device.heightPx / device.ppi) * 72,
  };
}
