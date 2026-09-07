import {
  collectSourceFiles,
  extractTags,
  findHexHits,
  findPxSpacingHits,
  hasInput,
  hasNativeButton,
  hasSelector,
  joinedSource,
  tokenReferenced,
} from "./source-scan.js";
import {
  forbiddenIncludes,
  rubricIncludes,
} from "./inventory.js";
import type { Finding, GateResult, Inventory } from "./types.js";

export async function runGateA(
  inventory: Inventory,
  sourceDir: string,
): Promise<GateResult> {
  const files = await collectSourceFiles(sourceDir);
  if (files.length === 0) {
    return {
      name: "A",
      passed: false,
      findings: [
        {
          code: "wrong-component",
          detail: `No Angular source files found under ${sourceDir}`,
        },
      ],
    };
  }
  const source = joinedSource(files);
  const findings: Finding[] = [];

  for (const component of inventory.components) {
    if (!component.required) continue;
    const selector = component.angular.selector;
    const tags = extractTags(source, selector);
    const present = tags.length > 0;

    if (!present) {
      if (rubricIncludes(inventory, "wrong-component")) {
        const raw =
          forbiddenIncludes(inventory, "raw-button") && hasNativeButton(source);
        findings.push({
          code: "wrong-component",
          componentId: component.id,
          forbidden: raw ? "raw-button" : undefined,
          detail: raw
            ? `${component.id}: expected <${selector}>, found native <button> (raw-button)`
            : `${component.id}: required selector <${selector}> is missing`,
        });
      }
      if (rubricIncludes(inventory, "missing-variant")) {
        const inputs = Object.entries(component.angular.inputs ?? {});
        if (inputs.length > 0) {
          const desc = inputs
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(", ");
          findings.push({
            code: "missing-variant",
            componentId: component.id,
            detail: `${component.id}: <${selector}> missing; cannot apply required input(s) ${desc}`,
          });
        }
      }
    } else if (rubricIncludes(inventory, "missing-variant")) {
      const inputs = component.angular.inputs ?? {};
      const missing = Object.entries(inputs).filter(([name, value]) => {
        return !tags.some((attrs) => hasInput(attrs, name, String(value)));
      });
      if (missing.length > 0) {
        const desc = missing
          .map(([name, value]) => `${name}=${String(value)}`)
          .join(", ");
        findings.push({
          code: "missing-variant",
          componentId: component.id,
          detail: `${component.id}: <${selector}> missing required input(s) ${desc}`,
        });
      }
    }
  }

  if (
    forbiddenIncludes(inventory, "raw-button") &&
    hasNativeButton(source) &&
    rubricIncludes(inventory, "wrong-component")
  ) {
    const already = findings.some(
      (f) => f.code === "wrong-component" && f.forbidden === "raw-button",
    );
    if (!already) {
      const coveredByRequired = inventory.components.some(
        (c) => c.required && hasSelector(source, c.angular.selector),
      );
      if (!coveredByRequired) {
        findings.push({
          code: "wrong-component",
          forbidden: "raw-button",
          detail: "native <button> is forbidden (raw-button); use the DS selector",
        });
      } else if (
        inventory.components.some(
          (c) =>
            c.required &&
            !hasSelector(source, c.angular.selector) &&
            !findings.some(
              (f) => f.componentId === c.id && f.code === "wrong-component",
            ),
        )
      ) {
        // already reported per-component
      } else if (
        inventory.components.every(
          (c) => !c.required || hasSelector(source, c.angular.selector),
        )
      ) {
        findings.push({
          code: "wrong-component",
          forbidden: "raw-button",
          detail: "native <button> is forbidden (raw-button) even when DS selectors are present",
        });
      }
    }
  }

  if (rubricIncludes(inventory, "token-drift")) {
    const hexHits = forbiddenIncludes(inventory, "inline-hex")
      ? findHexHits(source)
      : [];
    const pxHits = forbiddenIncludes(inventory, "inline-px-spacing")
      ? findPxSpacingHits(source)
      : [];

    if (hexHits.length > 0) {
      findings.push({
        code: "token-drift",
        forbidden: "inline-hex",
        detail: `inline hex color(s) forbidden: ${hexHits.slice(0, 8).join(", ")}`,
      });
    }
    if (pxHits.length > 0) {
      findings.push({
        code: "token-drift",
        forbidden: "inline-px-spacing",
        detail: `inline px spacing forbidden: ${pxHits.slice(0, 8).join(", ")}`,
      });
    }

    for (const component of inventory.components) {
      if (!component.required || component.tokens.length === 0) continue;
      const missingTokens = component.tokens.filter(
        (token) => !tokenReferenced(source, token),
      );
      if (missingTokens.length > 0 && (hexHits.length > 0 || pxHits.length > 0)) {
        findings.push({
          code: "token-drift",
          componentId: component.id,
          detail: `${component.id}: tokens not referenced (${missingTokens.join(", ")}); replace raw values with DS tokens`,
        });
      }
    }
  }

  return {
    name: "A",
    passed: findings.length === 0,
    findings,
  };
}
