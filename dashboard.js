/* dashboard.js
   Unified UNDP dashboard:
   - Motion Chart (animated scatter)
   - Synchronized Choropleth
   - Slider (d3-drag) + Sunburst (d3-hierarchy) drilldown
   - Data source: country_data.json
   - D3 v7 assumed loaded in page
*/

/*
 Sources integrated from your files:
 - Motion chart & interpolation (d3.timer / d3.interpolate / d3.interval). See: file 2-1.js. :contentReference[oaicite:3]{index=3}
 - Choropleth + topojson matching + setChoroplethYear sync hooks. See: file 2-2.js. :contentReference[oaicite:4]{index=4}
 - Slider (d3-drag) + Sunburst (d3-hierarchy) + scatter update structure. See: file 2-3.js. :contentReference[oaicite:5]{index=5}
*/

// Wrap in IIFE so global namespace is small
(async function() {
  // Settings / resources
  const DATA_URL = "country_data.json";
  const TOPO_URL = "https://unpkg.com/world-atlas@2/countries-50m.json";

  // Shared state
  let rawData = [];
  let years = [];
  let currentYearIndex = 0;
  let isPlaying = false;
  let duration = 1200; // default animation duration (ms) - will be set by control
  let playInterval = null;

  // DOM selectors (tolerant — if missing in HTML we create minimal elements)
  const ensure = (sel, tag='div', attrs={}) => {
    let el = d3.select(sel);
    if (el.empty()) {
      el = d3.select("body").append(tag).attr("id", sel.replace('#',''));
      Object.entries(attrs).forEach(([k,v])=>el.attr(k,v));
    }
    return el;
  };

  // Motion chart SVG: prefer #chart; fallback to #scatter-svg
  const svgMotion = d3.select("#chart").empty() ? d3.select("#scatter-svg") : d3.select("#chart");
  if (svgMotion.empty()) {
    // create a default chart SVG if none exists
    d3.select("body").append("svg").attr("id","chart").attr("width",900).attr("height",560);
  }

  // Map and sunburst
  const svgMap = d3.select("#map");
  const svgSun = d3.select("#sunburst-svg");

  // Tooltips (single shared tooltip)
  const tooltip = d3.select("#tooltip");
  if (tooltip.empty()) {
    d3.select("body").append("div").attr("id","tooltip")
      .style("position","absolute")
      .style("pointer-events","none")
      .style("display","none")
      .style("background","rgba(0,0,0,0.8)")
      .style("color","#fff")
      .style("padding","8px")
      .style("border-radius","6px");
  }

  // Controls
  const playBtn = d3.select("#playPause").empty() ? d3.select("#playBtn") : d3.select("#playPause");
  const stepBackBtn = d3.select("#stepBack");
  const stepForwardBtn = d3.select("#stepForward");
  const yearLabel = d3.select("#yearLabel").empty() ? d3.select("#scatterYear") : d3.select("#yearLabel");
  const speedSelect = d3.select("#speedSelect").empty() ? d3.select("#speedSelect") : d3.select("#speedSelect");
  const sliderWrap = d3.select("#yearSlider");
  const sliderHandle = d3.select("#sliderHandle");
  const sliderFill = d3.select(".slider-fill");

  // Basic scales & containers for motion scatter (based on code in 2-1 & 2-3)
  const motionSvg = d3.select("#chart").empty() ? d3.select("#scatter-svg") : d3.select("#chart");
  const mWidth = +motionSvg.attr("width") || 900;
  const mHeight = +motionSvg.attr("height") || 560;
  const mMargin = { top: 40, right: 30, bottom: 70, left: 90 };
  const mInnerW = mWidth - mMargin.left - mMargin.right;
  const mInnerH = mHeight - mMargin.top - mMargin.bottom;
  const mG = motionSvg.append("g").attr("transform", `translate(${mMargin.left},${mMargin.top})`);

  const xScale = d3.scaleLog().clamp(true);
  const yScale = d3.scaleLinear();
  const rScale = d3.scaleSqrt();
  const colorScale = d3.scaleOrdinal(d3.schemeTableau10);

  const xAxisG = mG.append("g").attr("transform", `translate(0, ${mInnerH})`);
  const yAxisG = mG.append("g");
  mG.append("text").attr("class","axis-label").attr("x", mInnerW/2).attr("y", mInnerH + 50).attr("text-anchor","middle").text("GDP per Capita (log scale)");
  mG.append("text").attr("class","axis-label").attr("transform", `translate(-60, ${mInnerH/2}) rotate(-90)`).attr("text-anchor","middle").text("Life Expectancy (years)");

  const bubbleG = mG.append("g").attr("class","bubbles");

  // Map resources: projection + path (from file 2-2)
  const mapSvg = svgMap;
  let mapCountriesGeo = null; // geo features
  const projection = d3.geoNaturalEarth1();
  const mapPath = d3.geoPath(projection);

  // Sunburst resources (from file 2-3)
  const sunSvg = svgSun;
  const sunView = sunSvg.empty() ? null : sunSvg.attr("viewBox") ? sunSvg.attr("viewBox").split(" ").map(Number) : null;
  const sunW = sunView ? sunView[2] : 420;
  const sunH = sunView ? sunView[3] : 420;
  const sunRadius = Math.min(sunW, sunH)/2 - 8;
  const sunG = sunSvg.empty() ? null : sunSvg.append("g").attr("transform", `translate(${sunW/2},${sunH/2})`);
  const partition = d3.partition().size([2*Math.PI, sunRadius]);
  const arc = d3.arc().startAngle(d => d.x0).endAngle(d => d.x1).innerRadius(d => d.y0).outerRadius(d=>d.y1-1);

  // For continent hover state
  let hoverContinent = null;

  // --- Load data (both country_data and topojson) ---
  try {
    const [data, topo] = await Promise.all([ d3.json(DATA_URL), d3.json(TOPO_URL) ]);
    rawData = data.map(d => ({
      country: d.country,
      continent: d.continent,
      year: +d.year,
      lifeExp: d.lifeExp == null ? null : +d.lifeExp,
      pop: d.pop == null ? null : +d.pop,
      gdpPercap: d.gdpPercap == null ? null : +d.gdpPercap
    }));

    // years and grouping
    years = Array.from(new Set(rawData.map(d=>d.year))).sort((a,b)=>a-b);
    if (years.length === 0) throw new Error("No years in dataset");
    currentYearIndex = 0;

    // prepare byYear map
    const byYear = d3.group(rawData, d => d.year);

    // compute extents for scales (global)
    const gdpVals = rawData.map(d => (d.gdpPercap > 0 ? d.gdpPercap : null)).filter(Boolean);
    const lifeVals = rawData.map(d => d.lifeExp).filter(v=>v!=null);
    const popVals = rawData.map(d => d.pop).filter(Boolean);
    const continents = Array.from(new Set(rawData.map(d=>d.continent).filter(Boolean)));

    xScale.domain([Math.max(1,d3.min(gdpVals)), d3.max(gdpVals)]).range([0,mInnerW]);
    yScale.domain([d3.min(lifeVals)-2, d3.max(lifeVals)+2]).range([mInnerH,0]);
    rScale.domain([d3.min(popVals), d3.max(popVals)]).range([3,42]);
    colorScale.domain(continents);

    // draw axes
    const xAxis = d3.axisBottom(xScale).ticks(10, "~s");
    const yAxis = d3.axisLeft(yScale);
    xAxisG.call(xAxis);
    yAxisG.call(yAxis);

    // set control default duration from UI if present
    if (!speedSelect.empty()) duration = +speedSelect.node().value;

    // prepare initial state map (like file 2-1)
    const countries = Array.from(new Set(rawData.map(d=>d.country)));
    const startYear = years[0];
    const stateByCountry = new Map();
    for (const c of countries) {
      const rec = (byYear.get(startYear) || []).find(d=>d.country === c);
      stateByCountry.set(c, {
        country: c,
        continent: rec ? rec.continent : null,
        lifeExp: rec ? rec.lifeExp : null,
        pop: rec ? rec.pop : null,
        gdpPercap: rec ? rec.gdpPercap : null,
        visible: !!rec
      });
    }

    // create bubble nodes (all countries; displayed conditionally)
    bubbleG.selectAll("circle")
      .data(Array.from(stateByCountry.values()), d=>d.country)
      .enter()
      .append("circle")
      .attr("cx", d => d.gdpPercap && d.gdpPercap > 0 ? xScale(d.gdpPercap) : -100)
      .attr("cy", d => d.lifeExp != null ? yScale(d.lifeExp) : -100)
      .attr("r", d => d.pop != null ? rScale(d.pop) : 0)
      .attr("fill", d => d.continent ? colorScale(d.continent) : "#999")
      .attr("fill-opacity", 0.75)
      .attr("stroke","#222")
      .attr("stroke-opacity", 0.2)
      .style("display", d => d.visible ? null : "none")
      .on("mouseenter", function(event,d){
        tooltip.style("display","block").html(`
          <strong>${d.country}</strong><br/>
          ${d.continent ? d.continent + '<br/>' : ''}
          GDP per Capita: ${d.gdpPercap ? d3.format(",.2f")(d.gdpPercap) : 'N/A'}<br/>
          Life Exp: ${d.lifeExp != null ? d3.format(".1f")(d.lifeExp) : 'N/A'}<br/>
          Pop: ${d.pop ? d3.format(",")(d.pop) : 'N/A'}
        `);
      })
      .on("mousemove", (event)=> tooltip.style("left",(event.pageX+12)+"px").style("top",(event.pageY-12)+"px"))
      .on("mouseleave", ()=> tooltip.style("display","none"));

    // ---------- Choropleth setup (adapted from file 2-2) ----------
    // topo -> geo features
    mapCountriesGeo = topojson.feature(topo, topo.objects.countries).features;
    // tune projection to map SVG size if available
    if (!mapSvg.empty()) {
      const v = mapSvg.attr("viewBox") ? mapSvg.attr("viewBox").split(" ").map(Number) : null;
      if (v) {
        projection.scale(v[2] / 1.8 / Math.PI).translate([v[2]/2, v[3]/2]);
      } else {
        projection.scale(160).translate([480, 250]);
      }
    }
    // build datasetByCountry-year for fast lookup
    const datasetByCountryAndYear = new Map();
    rawData.forEach(d => {
      const key = (d.country || "").trim().toLowerCase();
      if (!datasetByCountryAndYear.has(key)) datasetByCountryAndYear.set(key, new Map());
      datasetByCountryAndYear.get(key).set(d.year, d);
    });

    // life extent and color scale
    const lifeExtent = d3.extent(rawData.map(d=>d.lifeExp).filter(v=>v!=null));
    if (!isFinite(lifeExtent[0])) lifeExtent[0] = 20;
    if (!isFinite(lifeExtent[1])) lifeExtent[1] = 85;
    const colorSeq = d3.scaleSequential().domain([lifeExtent[0], lifeExtent[1]]).interpolator(d3.interpolateYlOrRd);

    // findRecordForFeature (robust matching, adapted)
    const nameMapping = {}; // you can extend this mapping
    function findRecordForFeature(feature, year) {
      const fname = (feature.properties && (feature.properties.name || feature.properties.NAME)) || "";
      const key = fname.trim().toLowerCase();
      if (datasetByCountryAndYear.has(key)) return datasetByCountryAndYear.get(key).get(year) || null;
      if (nameMapping[key] && datasetByCountryAndYear.has(nameMapping[key])) return datasetByCountryAndYear.get(nameMapping[key]).get(year) || null;
      // fallback partial match
      for (const [dKey, yMap] of datasetByCountryAndYear.entries()) {
        if (dKey.includes(key) || key.includes(dKey)) {
          const r = yMap.get(year);
          if (r) return r;
        }
      }
      return null;
    }

    // Draw map paths
    const mapG = mapSvg.empty() ? null : mapSvg.append("g").attr("class","chor-countries");
    if (mapG) {
      mapG.selectAll("path")
        .data(mapCountriesGeo)
        .enter()
        .append("path")
        .attr("d", mapPath)
        .attr("fill", "#ddd")
        .attr("stroke","#777")
        .attr("stroke-width",0.3)
        .on("mouseenter", function(event,d){
          d3.select(this).attr("stroke-width",0.9);
          const rec = findRecordForFeature(d, years[currentYearIndex]);
          tooltip.style("display","block").html(
            (rec ? `<strong>${rec.country}</strong><br/>Life: ${rec.lifeExp}<br/>GDP: ${rec.gdpPercap}` :
             `<strong>${(d.properties && d.properties.name)||"Unknown"}</strong><br/><em>No data</em>`)
          );
        })
        .on("mousemove", (event)=>tooltip.style("left",(event.pageX+12)+"px").style("top",(event.pageY-12)+"px"))
        .on("mouseleave", function(){ d3.select(this).attr("stroke-width",0.3); tooltip.style("display","none"); });
    }

    // updateMapForYear function (keeps map in sync with motion chart)
    function updateMapForYear(year, transMs = 600) {
      if (!mapG) return;
      const yr = +year;
      // set year label if exists
      const mapYearLabel = d3.select("#mapYear");
      if (!mapYearLabel.empty()) mapYearLabel.text(`Year: ${yr}`);
      mapG.selectAll("path")
        .transition().duration(transMs)
        .attr("fill", feature => {
          const rec = findRecordForFeature(feature, yr);
          return (rec && rec.lifeExp != null && !isNaN(rec.lifeExp)) ? colorSeq(rec.lifeExp) : "#ddd";
        });
    }

    // expose setter to global (compatible with file 2-2)
    window.setChoroplethYear = updateMapForYear;

    // ---------- Sunburst & slider ----------

    // Build sunburst hierarchy (World -> Continent -> Country) using rawData
    if (sunG) {
      const continentsMap = d3.group(rawData, d=>d.continent);
      const rootObj = { name: "World", children: [] };
      for (const [cont, rows] of continentsMap.entries()) {
        const countriesMap = d3.group(rows, d=>d.country);
        const contNode = { name: cont, children: [] };
        for (const [country, crow] of countriesMap.entries()) contNode.children.push({ name: country, value: 1 });
        rootObj.children.push(contNode);
      }
      const root = d3.hierarchy(rootObj).sum(d=>d.value||0).sort((a,b)=>b.value-a.value);
      partition(root);
      const nodes = sunG.selectAll("path").data(root.descendants().filter(d=>d.depth>0));
      nodes.enter().append("path")
        .attr("d", arc)
        .attr("fill", d => d.depth===1 ? colorScale(d.data.name) : colorScale(d.parent.data.name))
        .attr("stroke","#fff").attr("stroke-width",0.5)
        .on("mouseenter", function(event,d) {
          if (d.depth===1) {
            hoverContinent = d.data.name;
            // fade non-matching bubbles in motion chart
            bubbleG.selectAll("circle").transition().duration(200).style("opacity", b => (b.continent===hoverContinent ? 1 : 0.12));
          }
          // tooltip
          showTooltip( d.depth===1 ? `<strong>${d.data.name}</strong><br/>Countries: ${d.value}` : `<strong>${d.data.name}</strong>`, event );
        })
        .on("mousemove", (ev)=> moveTooltip(ev))
        .on("mouseleave", function(event,d) {
          hoverContinent = null;
          bubbleG.selectAll("circle").transition().duration(200).style("opacity",1);
          hideTooltip();
        })
        .on("click", function(event,d) {
          if (d.depth===1) {
            // zoom into continent: for simplicity, we'll just filter scatter opacity
            bubbleG.selectAll("circle").transition().duration(400).style("opacity", b => (b.continent===d.data.name ? 1 : 0.08));
          }
        });

      // center circle to zoom out (reset)
      sunG.append("circle").attr("r", sunRadius*0.22).attr("fill","#fff").attr("pointer-events","all").on("click", () => {
        bubbleG.selectAll("circle").transition().duration(400).style("opacity",1);
      });
      sunG.append("text").attr("text-anchor","middle").attr("dy","0.35em").style("font-size","12px").text("World");
    }

    // Slider: implement d3-drag that scrubs years and stops animation (merged from file 2-3)
    const MIN_YEAR = years[0];
    const MAX_YEAR = years[years.length-1];

    function pctToYear(pct) {
      const y = Math.round(MIN_YEAR + pct * (MAX_YEAR - MIN_YEAR));
      return Math.max(MIN_YEAR, Math.min(MAX_YEAR, y));
    }
    function yearToPct(y) {
      return (y - MIN_YEAR) / (MAX_YEAR - MIN_YEAR);
    }
    // compute slider bounds
    function sliderBounds() {
      const node = sliderWrap.node();
      if (!node) return {left:0,right:100,width:100};
      const r = node.getBoundingClientRect();
      return {left:r.left, right:r.right, width:r.width};
    }

    function updateSliderFromYear(year) {
      if (sliderHandle.empty() || sliderFill.empty() || sliderWrap.empty()) return;
      const pct = yearToPct(year);
      const b = sliderBounds();
      sliderHandle.style("left", (pct * b.width) + "px");
      sliderFill.style("width", (pct*100) + "%");
      sliderHandle.attr("aria-valuenow", year);
    }

    // dragging behavior
    if (!sliderHandle.empty()) {
      const drag = d3.drag()
        .on("start drag", (event) => {
          stopPlaying(); // stop auto play
          const b = sliderBounds();
          const pct = Math.max(0, Math.min(1, (event.sourceEvent.clientX - b.left) / b.width));
          const yr = pctToYear(pct);
          // find index and set
          const idx = years.indexOf(yr);
          if (idx >= 0) { currentYearIndex = idx; updateToYearIndex(currentYearIndex, 0); }
        })
        .on("end", ()=> {});
      sliderHandle.call(drag);

      // clicking on track jumps
      sliderWrap.select(".slider-track").on("click", (event) => {
        stopPlaying();
        const b = sliderBounds();
        const pct = Math.max(0, Math.min(1, (event.clientX - b.left) / b.width));
        const yr = pctToYear(pct);
        const idx = years.indexOf(yr);
        if (idx>=0) { currentYearIndex = idx; updateToYearIndex(currentYearIndex, 200); }
      });
    }

    // ---------- Motion chart interpolation transition function (adapted from file 2-1) ----------
    let animTimer = null;
    function transitionToYearIndex(targetIdx, transDuration = duration) {
      if (animTimer) animTimer.stop();
      const fromIdx = currentYearIndex;
      const toIdx = targetIdx;
      const fromYear = years[fromIdx];
      const toYear = years[toIdx];

      const fromRecords = (d3.group(rawData, d=>d.year).get(fromYear)) || [];
      const toRecords = (d3.group(rawData, d=>d.year).get(toYear)) || [];
      const fromMap = new Map(fromRecords.map(d=>[d.country,d]));
      const toMap = new Map(toRecords.map(d=>[d.country,d]));

      // prepare interpolation info for every tracked country
      const stateEntries = Array.from(bubbleG.selectAll("circle").data(), d=>d.country);
      const interpInfo = [];
      bubbleG.selectAll("circle").data().forEach(state => {
        const country = state.country;
        const fromRec = fromMap.get(country) || null;
        const toRec = toMap.get(country) || null;
        const startGDP = state.gdpPercap != null ? state.gdpPercap : (fromRec && fromRec.gdpPercap ? fromRec.gdpPercap : null);
        const startLife= state.lifeExp != null ? state.lifeExp : (fromRec && fromRec.lifeExp ? fromRec.lifeExp : null);
        const startPop = state.pop != null ? state.pop : (fromRec && fromRec.pop ? fromRec.pop : null);
        const endGDP = toRec && toRec.gdpPercap != null ? toRec.gdpPercap : null;
        const endLife = toRec && toRec.lifeExp != null ? toRec.lifeExp : null;
        const endPop = toRec && toRec.pop != null ? toRec.pop : null;
        const startG = (startGDP != null && startGDP>0) ? startGDP : xScale.domain()[0];
        const endG = (endGDP != null && endGDP>0) ? endGDP : xScale.domain()[0];
        const startL = (startLife != null) ? startLife : yScale.domain()[0] - 10;
        const endL = (endLife != null) ? endLife : yScale.domain()[0] - 10;
        const startP = (startPop != null) ? startPop : rScale.domain()[0];
        const endP = (endPop != null) ? endPop : rScale.domain()[0];

        interpInfo.push({
          country,
          start: { gdp: startG, life: startL, pop: startP, visible: startGDP!=null && startLife!=null && startPop!=null},
          end:   { gdp: endG,   life: endL,   pop: endP,   visible: endGDP!=null && endLife!=null && endPop!=null},
          startCont: state.continent,
          endCont: toRec ? toRec.continent : state.continent
        });
      });

      const t0 = d3.now();
      const dur = transDuration;
      animTimer = d3.timer(function() {
        const t = Math.min(1, (d3.now()-t0) / dur);
        interpInfo.forEach(info => {
          const igdp = d3.interpolateNumber(info.start.gdp, info.end.gdp)(t);
          const ilife = d3.interpolateNumber(info.start.life, info.end.life)(t);
          const ipop = d3.interpolateNumber(info.start.pop, info.end.pop)(t);
          // update DOM bound data (circle datum)
          const circle = bubbleG.selectAll("circle").filter(d=>d.country===info.country);
          // update datum values so next interp uses these values
          circle.datum(function(d){
            d.gdpPercap = igdp;
            d.lifeExp = ilife;
            d.pop = ipop;
            d.continent = t < 0.5 ? info.startCont : info.endCont;
            d.visible = info.start.visible || info.end.visible;
            return d;
          });
        });

        // sync visuals each frame
        bubbleG.selectAll("circle")
          .data() // returns array of datums
          .forEach(d => {
            const sel = bubbleG.selectAll("circle").filter(dd=>dd.country===d.country);
            sel.attr("cx", d => xScale(d.gdpPercap <= 0 ? xScale.domain()[0] : d.gdpPercap))
               .attr("cy", d => yScale(d.lifeExp))
               .attr("r", d => Math.max(0.5, rScale(d.pop)))
               .attr("fill", d => d.continent ? colorScale(d.continent) : "#999")
               .style("display", d => d.visible ? null : "none");
          });

        if (t === 1) {
          animTimer.stop(); animTimer = null;
          currentYearIndex = toIdx;
          // update labels & synced components
          if (!yearLabel.empty()) yearLabel.text(years[currentYearIndex]);
          // dispatch event for choropleth and other listeners
          document.dispatchEvent(new CustomEvent("yearChange", { detail: { year: years[currentYearIndex] } }));
          // update map and slider
          updateMapForYear(years[currentYearIndex], 0);
          updateSliderFromYear(years[currentYearIndex]);
        }
      });
    } // end transitionToYearIndex

    // wrapper to go to index
    function updateToYearIndex(idx, transMs=duration) {
      transitionToYearIndex(idx, transMs);
      // ensure yearLabel updated immediately
      if (!yearLabel.empty()) yearLabel.text(years[idx]);
      // also update choropleth immediately (no transition or small)
      updateMapForYear(years[idx], Math.max(120, transMs));
    }

    // Play / pause using d3.interval (as required)
    function startPlaying() {
      if (isPlaying) return;
      isPlaying = true;
      // update play button text if present
      if (!playBtn.empty()) playBtn.text("Pause");
      playInterval = d3.interval(()=>{
        const nextIdx = (currentYearIndex + 1) % years.length;
        updateToYearIndex(nextIdx);
      }, duration + 100);
    }
    function stopPlaying() {
      if (!isPlaying) return;
      isPlaying = false;
      if (!playBtn.empty()) playBtn.text("Play");
      if (playInterval) { playInterval.stop(); playInterval = null; }
    }

    // attach play control(s)
    if (!playBtn.empty()) {
      playBtn.on("click", ()=> { if (isPlaying) stopPlaying(); else startPlaying(); });
    } else {
      // fallback create a play button
      const pb = d3.select("body").append("button").text("Play").on("click", ()=> { if (isPlaying) { stopPlaying(); pb.text("Play"); } else { startPlaying(); pb.text("Pause"); }});
    }
    if (!stepBackBtn.empty()) stepBackBtn.on("click", ()=> { stopPlaying(); const prev = (currentYearIndex-1+years.length)%years.length; updateToYearIndex(prev, 200); });
    if (!stepForwardBtn.empty()) stepForwardBtn.on("click", ()=> { stopPlaying(); const nxt = (currentYearIndex+1)%years.length; updateToYearIndex(nxt, 200); });

    if (!speedSelect.empty()) {
      speedSelect.on("change", function(){ duration = +this.value; if (isPlaying) { stopPlaying(); startPlaying(); } });
    }

    // Initially set labels & map
    if (!yearLabel.empty()) yearLabel.text(years[currentYearIndex]);
    updateMapForYear(years[currentYearIndex], 0);
    updateSliderFromYear(years[currentYearIndex]);

    // Expose a global setter for other scripts/components
    window.setDashboardYear = (y) => {
      const idx = years.indexOf(+y);
      if (idx >= 0) { stopPlaying(); updateToYearIndex(idx, 300); }
    };

    // listen for yearChange (map already listens in its code previously; here we just ensure dispatch exists)
    document.addEventListener("yearChange", (e)=> {
      const y = e && e.detail && e.detail.year;
      if (y != null) {
        // update motion chart if external
        const idx = years.indexOf(+y);
        if (idx>=0 && idx !== currentYearIndex) { stopPlaying(); updateToYearIndex(idx, 300); }
      }
    });

    // Optional: Start playing automatically — commented out
    // startPlaying();

    // Helper tooltip functions
    function showTooltip(html, ev) {
      d3.select("#tooltip").style("display","block").html(html)
        .style("left",(ev.pageX+12)+"px").style("top",(ev.pageY-12)+"px");
    }
    function moveTooltip(ev) { d3.select("#tooltip").style("left",(ev.pageX+12)+"px").style("top",(ev.pageY-12)+"px"); }
    function hideTooltip() { d3.select("#tooltip").style("display","none"); }

    // Provide console guidance
    console.info("Dashboard initialized. Use window.setDashboardYear(year) to set a year programmatically.");
    console.info("Years available:", years.slice(0,8), "... total", years.length);

  } catch (err) {
    console.error("Failed to initialize dashboard:", err);
    alert("Dashboard initialization failed — see console for details.");
  }

})(); // end IIFE
