// Set your Mapbox access token here
mapboxgl.accessToken =
  "pk.eyJ1IjoicnlidWNzZCIsImEiOiJjbTc2aGk5ZG0wdzN2Mm1wejg4bnJkZGN6In0.h4mfOM5h3FUvmswxnwTPmQ";

// Initialize the map
const map = new mapboxgl.Map({
  container: "map", // ID of the div where the map will render
  style: "mapbox://styles/rybucsd/cm76htkoc004b01sldhjjdkey", // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18, // Maximum allowed zoom
});

map.on("load", () => {
  const jsonurl = "https://dsc106.com/labs/lab07/data/bluebikes-stations.json";
  const csvurl =
    "https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv";

  d3.json(jsonurl)
    .then((jsonData) => {
      d3.csv(csvurl).then(function (data) {
        const trips = data;
        const stations = jsonData.data.stations;

        // Calculate arrivals
        const arrivals = d3.rollup(
          trips,
          (v) => v.length,
          (d) => d.end_station_id
        );

        // Calculate departures
        const departures = d3.rollup(
          trips,
          (v) => v.length,
          (d) => d.start_station_id
        );

        // Add traffic data to stations
        stations.forEach((station) => {
          let id = station.short_name;
          station.arrivals = arrivals.get(id) ?? 0;
          station.departures = departures.get(id) ?? 0;
          station.totalTraffic = station.arrivals + station.departures;
        });

        // Create radius scale
        const radiusScale = d3
          .scaleSqrt()
          .domain([0, d3.max(stations, (d) => d.arrivals)])
          .range([3, 15]);

        const svg = d3.select("#map").select("svg");

        // Create a tooltip div
        const tooltip = d3
          .select("body")
          .append("div")
          .attr("class", "tooltip")
          .style("opacity", 0);

        // Create circles with scaled radius
        const circles = svg
          .selectAll("circle")
          .data(stations)
          .enter()
          .append("circle")
          .attr("r", (d) => radiusScale(d.arrivals))
          .attr("fill", "steelblue")
          .attr("stroke", "white")
          .attr("stroke-width", 1)
          .attr("opacity", 0.8)
          .on("mouseover", function (event, d) {
            tooltip.transition().duration(200).style("opacity", 0.9);
            tooltip
              .html(
                `${d.totalTraffic} trips<br>(${d.departures} departures, ${d.arrivals} arrivals)`
              )
              .style("left", event.pageX + 10 + "px")
              .style("top", event.pageY - 28 + "px");
          })
          .on("mouseout", function (d) {
            tooltip.transition().duration(500).style("opacity", 0);
          });

        function getCoords(station) {
          const point = new mapboxgl.LngLat(+station.lon, +station.lat);
          const { x, y } = map.project(point);
          return { cx: x, cy: y };
        }

        function updatePositions() {
          circles
            .attr("cx", (d) => getCoords(d).cx)
            .attr("cy", (d) => getCoords(d).cy);
        }

        updatePositions();

        map.addSource("boston_route", {
          type: "geojson",
          data: "https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...",
        });

        map.addSource("cambridge_route", {
          type: "geojson",
          data: "https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson",
        });

        map.addLayer({
          id: "bike-lanes",
          type: "line",
          source: "boston_route",
          paint: {
            "line-color": "green",
            "line-width": 3,
            "line-opacity": 0.4,
          },
        });

        map.addLayer({
          id: "cambridge-bike-lanes",
          type: "line",
          source: "cambridge_route",
          paint: {
            "line-color": "green",
            "line-width": 3,
            "line-opacity": 0.4,
          },
        });

        map.on("move", updatePositions);
        map.on("zoom", updatePositions);
        map.on("resize", updatePositions);
        map.on("moveend", updatePositions);
      });
    })
    .catch((error) => {
      console.error("Error loading JSON:", error);
    });
});
