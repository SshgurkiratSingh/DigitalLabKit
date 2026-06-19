import { ICDefinition, ICPin } from "../hooks/useICLibrary";
import { RoleCode } from "../hooks/useSerialProtocol";

export interface PinAssignment {
  icPin: number;
  virtualIndex: number;
  role: RoleCode;
  name: string;
  type: string;
  description: string;
}

const ROLE_LOOKUP: Record<string, RoleCode> = {
  INPUT: 0,
  OUTPUT: 1,
  POWER_GND: 2,
  POWER_VCC: 3,
  UNUSED: 4,
  CLK: 5,
};

const inferPowerRole = (pin: ICPin): RoleCode | null => {
  const target = pin.name.toUpperCase();
  const description = pin.function?.toUpperCase?.() || "";
  if (/GND|GROUND|VSS/.test(target) || /GROUND|VSS/.test(description)) {
    return ROLE_LOOKUP.POWER_GND;
  }
  if (/VCC|VDD|VREF|SUPPLY|POWER/.test(target) || /VCC|VDD|SUPPLY/.test(description)) {
    return ROLE_LOOKUP.POWER_VCC;
  }
  if (/CLK|CLOCK/.test(target) || /CLOCK/.test(description)) {
    return ROLE_LOOKUP.CLK;
  }
  return null;
};

export const inferRoleCode = (pin: ICPin): RoleCode => {
  const normalizedType = pin.type
    ? pin.type.toString().trim().toUpperCase()
    : "";
  const powerRole = inferPowerRole(pin);
  if (powerRole !== null) return powerRole;

  // Node drives IC inputs, so invert logical direction between IC pins and node roles
  if (normalizedType === "INPUT") return ROLE_LOOKUP.OUTPUT;
  if (normalizedType === "OUTPUT") return ROLE_LOOKUP.INPUT;
  if (normalizedType === "POWER") {
    // fallback to VCC vs GND detection if not handled earlier
    return /GND|GROUND|VSS/.test(pin.name.toUpperCase())
      ? ROLE_LOOKUP.POWER_GND
      : ROLE_LOOKUP.POWER_VCC;
  }
  return ROLE_LOOKUP.UNUSED;
};

export const toVirtualIndex = (pinNumber: number, pinCount: number): number => {
  if (pinCount === 16) return pinNumber - 1;
  if (pinCount === 14) {
    if (pinNumber >= 1 && pinNumber <= 7) return pinNumber - 1;
    if (pinNumber >= 8 && pinNumber <= 14) return pinNumber + 1;
  }
  throw new Error(`Unsupported pin mapping for pinCount=${pinCount}, pin=${pinNumber}`);
};

export const buildAssignments = (ic: ICDefinition | null): PinAssignment[] => {
  if (!ic) return [];
  return ic.pinConfiguration
    .filter((pin) => pin.pin >= 1)
    .map((pin) => ({
      icPin: pin.pin,
      virtualIndex: toVirtualIndex(pin.pin, ic.pinCount),
      role: inferRoleCode(pin),
      name: pin.name,
      type: pin.type,
      description: pin.function,
    }))
    .sort((a, b) => a.icPin - b.icPin);
};

export const buildRoleMap = (assignments: PinAssignment[]) => {
  const map: Record<number, PinAssignment> = {};
  assignments.forEach((assignment) => {
    map[assignment.virtualIndex] = assignment;
  });
  return map;
};
