
#  Global Health & Wealth Interactive Dashboard

---

## Dashboard Preview

![Dashboard Screenshot](dashboard-preview.png)

## Problem Statement

There is a need for an interactive and intuitive way to explore how global **health and wealth indicators** have changed over time. Traditional static charts cannot effectively reveal relationships, regional differences, or long-term development trends.

The goal of this project is to build a **synchronized, multi-view interactive dashboard** that clearly visualizes development patterns across countries and continents over time.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Advanced Maps & Projections](#advanced-maps--projections)
3. [Dynamic Choropleth Mapping](#dynamic-choropleth-mapping)
4. [Year Slider & Temporal Control](#year-slider--temporal-control)
5. [Visual Encoding Strategy](#visual-encoding-strategy)
6. [Dashboard Features](#dashboard-features)
7. [Interactivity & Synchronization](#interactivity--synchronization)
8. [How to Run the Project](#how-to-run-the-project)
9. [Contributors](#contributors)

---

## Project Overview

This project is an **interactive D3.js-based visualization dashboard** designed to explore global development indicators such as **GDP per capita, life expectancy, and population** over time.

The dashboard integrates multiple coordinated views, enabling users to analyze:

- Health vs. wealth relationships
- Regional and continental trends
- Temporal development patterns

All views are fully synchronized, ensuring consistent and intuitive exploration.

---

## Advanced Maps & Projections

### Projection & GeoPath

- Uses **NaturalEarth1 projection**, which provides a balanced trade-off between shape accuracy and readability.
- Centers the world map effectively without excessive distortion near the poles.
- Well-suited for global-scale datasets and comparisons.

---

## Dynamic Choropleth Mapping

The choropleth map dynamically updates to reflect **life expectancy** values for the selected year.

### Color Encoding (Task 2)

- Uses a **sequential color scheme**: `d3.interpolateYlOrRd`
- Encoding:

  - **Bright Yellow** → Low life expectancy
  - **Dark Red** → High life expectancy

- This color scale is intuitive and commonly used in demographic and health studies.

The map updates in real time using:

```js
.fill(d => colorScale(lifeExpValue))
```

---

## Year Slider & Temporal Control

A custom **year slider** is implemented using `d3.drag()` for manual temporal navigation.

### How It Works

- Drag handle left → Earlier years
- Drag handle right → Later years

Changing the year instantly updates:

- Scatter plot (motion chart)
- Choropleth map
- All linked interactions

---

## Visual Encoding Strategy

Different data attributes are encoded using appropriate D3 scales:

- **GDP per Capita** → `d3.scaleLog()`
- **Life Expectancy** → `d3.scaleLinear()`
- **Population (Bubble Radius)** → `d3.scaleSqrt()`

A **continent selection feature** is implemented to allow regional filtering and focused analysis.

---

## Dashboard Features

### Motion Chart (Scatter Plot)

- Displays the relationship between:

  - **GDP per Capita (Wealth)**
  - **Life Expectancy (Health)**

- Bubble size represents **population**
- Bubble color represents **continent**
- Bubbles animate smoothly as years change

---

### Choropleth Map

- Displays global **life expectancy distribution** for the selected year
- Countries are shaded using a yellow → red gradient
- Updates automatically with:

  - Year slider changes
  - Motion chart animation

---

### Sunburst Hierarchy (World → Continent → Country)

- Visualizes hierarchical grouping of countries by continent
- Hovering over a continent:

  - Highlights corresponding countries in the motion chart
  - Fades all unrelated regions

- Enables focused regional exploration

---

### Year Slider (Manual Scrubbing)

- Allows users to scrub through years **(1952–2007)**
- Instantly updates all visual components
- Interrupts automatic animation when manually adjusted

---

### Play / Pause Animation Controls

- Animate historical progress over time
- Step forward or backward by year
- Adjust animation speed
- Automatically synchronizes:

  - Scatter plot motion
  - Choropleth color transitions

---

### Tooltips & Hover Interactions

Hovering over any country (map or scatter plot) reveals:

- GDP per Capita
- Life Expectancy
- Population
- Continent

This provides detailed insights without visual clutter.

---

## Interactivity & Synchronization

All visualizations are **fully coordinated**:

- Year changes update every view simultaneously
- Hovering and selections in one chart affect others
- Ensures a seamless multi-view analytical experience

---

## How to Run the Project

1. Open **Visual Studio Code**
2. Place the `.html` and `.js` files in the same folder
3. Install the **Live Server** extension
4. Right-click the HTML file and select **“Open with Live Server”**
5. The dashboard will open in your browser

---

## Contributors

- **Amna Zubair**

---
