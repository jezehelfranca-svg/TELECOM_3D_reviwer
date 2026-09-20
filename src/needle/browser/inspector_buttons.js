// Interactive Route Pathway Breadcrumbs & Glowing Circuit Inspector
let routingCtx = (typeof computeRoutingHighlights === "function") ? computeRoutingHighlights(Wn) : null;
if (routingCtx) {
  let breadcrumbCard = document.createElement("div");
  breadcrumbCard.className = "route-pathway-card";

  let header = document.createElement("div");
  header.className = "route-pathway-header";
  let title = document.createElement("div");
  title.className = "route-pathway-title";
  let dot = document.createElement("span");
  dot.className = "route-pathway-glow-dot";
  let titleText = document.createElement("span");
  titleText.textContent = "Routed Circuit Pathway";
  title.append(dot, titleText);

  let countBadge = document.createElement("span");
  countBadge.className = "route-pathway-badge";
  let relCount = routingCtx.relatedEntities.size;
  countBadge.textContent = relCount > 0 ? (relCount + " connected hop" + (relCount > 1 ? "s" : "")) : "Direct / End";
  header.append(title, countBadge);
  breadcrumbCard.append(header);

  let flowContainer = document.createElement("div");
  flowContainer.className = "route-pathway-flow";

  let createChip = (ent, roleLabel, chipClass) => {
    let chip = document.createElement("button");
    chip.type = "button";
    chip.className = "flow-chip " + chipClass;
    let itemData = ent.userData.item || {};
    let labelText = itemData.label || itemData.id || "Unknown";
    chip.innerHTML = '<span class="chip-role">' + roleLabel + ':</span> <span class="chip-name">' + labelText + "</span>";
    chip.title = "Click to inspect " + labelText + " (" + ent.userData.kind + ")";
    chip.onclick = (ev) => {
      ev.stopPropagation();
      Ga(ent.userData.key);
    };
    return chip;
  };

  let arrow = () => {
    let a = document.createElement("div");
    a.className = "flow-arrow";
    a.textContent = "➔";
    return a;
  };

  if (e === "cables") {
    let row = document.createElement("div");
    row.className = "flow-row";

    if (routingCtx.sources.length) {
      let step = document.createElement("div");
      step.className = "flow-step";
      for (let sEnt of routingCtx.sources) {
        step.append(createChip(sEnt, "FROM", "chip-source"));
      }
      row.append(step);
      row.append(arrow());
    }

    let viaStep = document.createElement("div");
    viaStep.className = "flow-step";
    if (routingCtx.corridors.length) {
      for (let cEnt of routingCtx.corridors) {
        viaStep.append(createChip(cEnt, "VIA", "chip-corridor"));
      }
    } else {
      let noCorr = document.createElement("div");
      noCorr.className = "chip-empty";
      noCorr.textContent = "Direct Point-to-Point (No raceway)";
      viaStep.append(noCorr);
    }
    row.append(viaStep);

    if (routingCtx.targets.length) {
      row.append(arrow());
      let dstStep = document.createElement("div");
      dstStep.className = "flow-step";
      for (let dEnt of routingCtx.targets) {
        dstStep.append(createChip(dEnt, "TO", "chip-target"));
      }
      row.append(dstStep);
    }

    flowContainer.append(row);
  } else if (e === "devices" || e === "nodes") {
    if (routingCtx.cables.length) {
      let cableGroup = document.createElement("div");
      cableGroup.className = "flow-group";
      let gTitle = document.createElement("div");
      gTitle.className = "flow-group-title";
      gTitle.textContent = "Connected Circuits (" + routingCtx.cables.length + "):";
      cableGroup.append(gTitle);

      let cList = document.createElement("div");
      cList.className = "flow-chips-wrap";
      for (let cb of routingCtx.cables) {
        cList.append(createChip(cb, "CABLE", "chip-cable"));
      }
      cableGroup.append(cList);
      flowContainer.append(cableGroup);
    }

    if (routingCtx.corridors.length) {
      let corrGroup = document.createElement("div");
      corrGroup.className = "flow-group";
      let gTitle = document.createElement("div");
      gTitle.className = "flow-group-title";
      gTitle.textContent = "Traversed Containment (" + routingCtx.corridors.length + "):";
      corrGroup.append(gTitle);

      let cList = document.createElement("div");
      cList.className = "flow-chips-wrap";
      for (let cr of routingCtx.corridors) {
        cList.append(createChip(cr, "RACID", "chip-corridor"));
      }
      corrGroup.append(cList);
      flowContainer.append(corrGroup);
    }

    if (routingCtx.targets.length) {
      let dstGroup = document.createElement("div");
      dstGroup.className = "flow-group";
      let gTitle = document.createElement("div");
      gTitle.className = "flow-group-title";
      gTitle.textContent = "Connected Equipment (" + routingCtx.targets.length + "):";
      dstGroup.append(gTitle);

      let dList = document.createElement("div");
      dList.className = "flow-chips-wrap";
      for (let dt of routingCtx.targets) {
        dList.append(createChip(dt, "EQUIP", "chip-target"));
      }
      dstGroup.append(dList);
      flowContainer.append(dstGroup);
    }

    if (!routingCtx.cables.length && !routingCtx.targets.length) {
      let isolated = document.createElement("div");
      isolated.className = "chip-empty";
      isolated.textContent = "No connected circuits found for this device.";
      flowContainer.append(isolated);
    }
  } else if (e === "corridors") {
    if (routingCtx.cables.length) {
      let cableGroup = document.createElement("div");
      cableGroup.className = "flow-group";
      let gTitle = document.createElement("div");
      gTitle.className = "flow-group-title";
      gTitle.textContent = "Cables Carried in this Containment (" + routingCtx.cables.length + "):";
      cableGroup.append(gTitle);

      let cList = document.createElement("div");
      cList.className = "flow-chips-wrap";
      for (let cb of routingCtx.cables) {
        cList.append(createChip(cb, "CABLE", "chip-cable"));
      }
      cableGroup.append(cList);
      flowContainer.append(cableGroup);
    }

    let allDevs = [...new Set([...routingCtx.sources, ...routingCtx.targets])].filter(d => d !== Wn);
    if (allDevs.length) {
      let devGroup = document.createElement("div");
      devGroup.className = "flow-group";
      let gTitle = document.createElement("div");
      gTitle.className = "flow-group-title";
      gTitle.textContent = "Terminal Equipment Connected (" + allDevs.length + "):";
      devGroup.append(gTitle);

      let dList = document.createElement("div");
      dList.className = "flow-chips-wrap";
      for (let dt of allDevs) {
        dList.append(createChip(dt, "EQUIP", "chip-target"));
      }
      devGroup.append(dList);
      flowContainer.append(devGroup);
    }

    if (!routingCtx.cables.length) {
      let emptyCorr = document.createElement("div");
      emptyCorr.className = "chip-empty";
      emptyCorr.textContent = "Spare / Empty containment (No routed cables passing through).";
      flowContainer.append(emptyCorr);
    }
  }

  breadcrumbCard.append(flowContainer);
  r.append(breadcrumbCard);
}

// Needle Quick Action Buttons
let needleQuickBox = document.createElement("div");
needleQuickBox.style.cssText = "display:flex;gap:6px;margin:8px 0;";
let btnQuickSrc = document.createElement("button");
btnQuickSrc.type = "button"; btnQuickSrc.className = "quick-btn"; btnQuickSrc.textContent = "+ Set as Source";
btnQuickSrc.onclick = () => {
  const p = document.getElementById("mto-needle-prompt");
  if (p) { p.value = "Route cable from " + (t.label || t.id) + " to "; p.focus(); }
};
let btnQuickDst = document.createElement("button");
btnQuickDst.type = "button"; btnQuickDst.className = "quick-btn"; btnQuickDst.textContent = "+ Set as Destination";
btnQuickDst.onclick = () => {
  const p = document.getElementById("mto-needle-prompt");
  if (p) {
    let cur = p.value.trim();
    if (/\bto\s*$/i.test(cur)) p.value = cur.replace(/\bto\s*$/i, "to " + (t.label || t.id));
    else if (/\bto\s+[A-Za-z0-9\-_]+/i.test(cur)) p.value = cur.replace(/\bto\s+[A-Za-z0-9\-_]+/i, "to " + (t.label || t.id));
    else p.value = cur + " to " + (t.label || t.id);
    p.focus();
  }
};
needleQuickBox.append(btnQuickSrc, btnQuickDst);
r.append(needleQuickBox);
