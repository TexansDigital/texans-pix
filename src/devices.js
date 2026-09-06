// Device presets. `w` and `h` are real screen pixels — an export must match
// these exactly, which is the whole point of the studio.
//
// Safe zones are fractions of height. On an iOS lock screen the clock block
// sits high and the control row sits at the bottom; anything we draw there
// gets covered. Home screens lose the dock and the icon grid instead.

const IOS_LOCK = { clockTop: 0.075, clockBottom: 0.235, widgetBottom: 0.30, controlsTop: 0.87 };
const IOS_HOME = { statusBottom: 0.055, dockTop: 0.855 };
const AND_LOCK = { clockTop: 0.09, clockBottom: 0.26, widgetBottom: 0.32, controlsTop: 0.88 };
const AND_HOME = { statusBottom: 0.045, dockTop: 0.87 };

export const DEVICES = [
  // --- iPhone -------------------------------------------------------------
  { id: 'ip-16-pro-max', group: 'iPhone', label: '16 Pro Max / 17 Pro Max', w: 1320, h: 2868, lock: IOS_LOCK, home: IOS_HOME },
  { id: 'ip-16-pro',     group: 'iPhone', label: '16 Pro',                  w: 1206, h: 2622, lock: IOS_LOCK, home: IOS_HOME },
  { id: 'ip-plus',       group: 'iPhone', label: '14/15/16 Plus & Pro Max', w: 1290, h: 2796, lock: IOS_LOCK, home: IOS_HOME },
  { id: 'ip-std',        group: 'iPhone', label: '14 Pro / 15 / 16',        w: 1179, h: 2556, lock: IOS_LOCK, home: IOS_HOME },
  { id: 'ip-xr',         group: 'iPhone', label: 'XR / 11',                 w:  828, h: 1792, lock: IOS_LOCK, home: IOS_HOME },
  { id: 'ip-se',         group: 'iPhone', label: 'SE (3rd gen)',            w:  750, h: 1334, lock: IOS_LOCK, home: IOS_HOME },

  // --- Android ------------------------------------------------------------
  { id: 'sg-ultra', group: 'Android', label: 'Galaxy S24/S25 Ultra', w: 1440, h: 3120, lock: AND_LOCK, home: AND_HOME },
  { id: 'sg-std',   group: 'Android', label: 'Galaxy S24/S25',       w: 1080, h: 2340, lock: AND_LOCK, home: AND_HOME },
  { id: 'px-9',     group: 'Android', label: 'Pixel 9',              w: 1080, h: 2424, lock: AND_LOCK, home: AND_HOME },
  { id: 'px-9-xl',  group: 'Android', label: 'Pixel 9 Pro XL',       w: 1344, h: 2992, lock: AND_LOCK, home: AND_HOME },
  { id: 'and-gen',  group: 'Android', label: 'Common 1080 x 2400',   w: 1080, h: 2400, lock: AND_LOCK, home: AND_HOME },

  // --- Other --------------------------------------------------------------
  { id: 'story',   group: 'Other', label: 'Social story 9:16', w: 1080, h: 1920, lock: AND_LOCK, home: AND_HOME },
  { id: 'ipad',    group: 'Other', label: 'iPad Pro 11"',      w: 1668, h: 2388, lock: IOS_LOCK, home: IOS_HOME },
  { id: 'desktop', group: 'Other', label: 'Desktop 2560 x 1440', w: 2560, h: 1440, lock: null, home: { statusBottom: 0, dockTop: 1 } },
];

export const DEVICE_GROUPS = [...new Set(DEVICES.map(d => d.group))];

export function getDevice(id) {
  return DEVICES.find(d => d.id === id) || DEVICES[0];
}

// The band a template may safely place type in, as {top, bottom} fractions.
// Lock screens push everything below the widget row and above the controls.
export function typeBand(device, surface) {
  if (surface === 'lock' && device.lock) {
    return { top: device.lock.widgetBottom + 0.02, bottom: device.lock.controlsTop - 0.02 };
  }
  const home = device.home || { statusBottom: 0.05, dockTop: 0.86 };
  return { top: home.statusBottom + 0.02, bottom: home.dockTop - 0.02 };
}
