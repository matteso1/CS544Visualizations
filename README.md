# Visualizing Distributed Data Systems

Interactive, single-figure explanations of the systems taught in
**UW–Madison CS 544** — Cassandra rings, Kafka partitions, HDFS
pipelined writes, and HBase regions.

> **Live site:** [matteso1.github.io/CS544Visualizations](https://matteso1.github.io/CS544Visualizations/)

Built spring 2026 by **Nils Matteson** as a way to study for the final
by drawing the diagrams I wished I had been studying from. With thanks
to **Tyler Caraza-Harter**, whose lectures and exam questions are the
source material for nearly every interaction here.

## The figures

| #   | Figure                              | What you can do                                                     |
| --- | ----------------------------------- | ------------------------------------------------------------------- |
| I   | [The Cassandra ring](./cassandra.html) | Drag a key around an 8-vnode ring; toggle RF and CL; watch quorum.  |
| II  | [A Kafka topic, partitioned](./kafka.html) | Send keyed/round-robin messages; resize topic; add consumer groups. |
| III | [HDFS, by the byte](./hdfs.html)    | Push a file into a 5-DataNode cluster; watch byte counters fill.    |
| IV  | [HBase regions on a row line](./hbase.html) | Add rows; force splits; kill RegionServers; watch reassignment.     |

## Design

* **No build step.** Static HTML/CSS/JS so the site can be hosted on
  GitHub Pages with no toolchain. Open any `.html` file locally and
  it works.
* **One CSS file.** A "lab notebook" aesthetic — warm paper, ink,
  oxblood accent, EB Garamond + JetBrains Mono. Hard rules, no
  rounded corners, every diagram numbered like a Tufte figure.
* **One JS module per figure.** Each visualization is a self-contained
  IIFE in `scripts/`. SVG is built and animated directly; no D3, no
  framework.

## Project structure

```
.
├── index.html            ← landing / atlas
├── cassandra.html        ← Figure I
├── kafka.html            ← Figure II
├── hdfs.html             ← Figure III
├── hbase.html            ← Figure IV
├── styles/
│   └── main.css          ← entire design system
├── scripts/
│   ├── cassandra-ring.js
│   ├── kafka-partitions.js
│   ├── hdfs-pipeline.js
│   └── hbase-regions.js
├── .nojekyll             ← tells GH Pages to skip Jekyll
└── README.md
```

## Running locally

Just open `index.html` in a browser, or serve the directory:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploying to GitHub Pages

Push to `main`, then in the repo settings under **Pages**, set:

* **Source:** `Deploy from a branch`
* **Branch:** `main` / `/ (root)`

Within a minute the site is live at
`https://<your-user>.github.io/CS544Visualizations/`.

## License

MIT.

---

Set in EB Garamond and JetBrains Mono.
© 2026 Nils Matteson.
