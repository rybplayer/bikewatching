// Set your Mapbox access token here
mapboxgl.accessToken =
  "pk.eyJ1IjoicnlidWNzZCIsImEiOiJjbTc2aGk5ZG0wdzN2Mm1wejg4bnJkZGN6In0.h4mfOM5h3FUvmswxnwTPmQ";

let filteredTrips = [];
let filteredArrivals = new Map();
let filteredDepartures = new Map();
let filteredStations = [];

// Add these at the top level with other declarations
let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

// Add at the top level with other declarations
let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function filterByMinute(tripsByMinute, minute) {
  // Normalize both to the [0, 1439] range
  let minMinute = (minute - 60 + 1440) % 1440;
  let maxMinute = (minute + 60) % 1440;

  if (minMinute > maxMinute) {
    let beforeMidnight = tripsByMinute.slice(minMinute);
    let afterMidnight = tripsByMinute.slice(0, maxMinute);
    return beforeMidnight.concat(afterMidnight).flat();
  } else {
    return tripsByMinute.slice(minMinute, maxMinute).flat();
  }
}

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

        // Store these in wider scope for filtering
        let timeFilter = -1;

        // Create radius scale first
        const radiusScale = d3
          .scaleSqrt()
          .domain([0, d3.max(stations, (d) => d.totalTraffic)])
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
          .attr("r", (d) => radiusScale(d.totalTraffic))
          .attr("stroke", "white")
          .attr("stroke-width", 1)
          .attr("opacity", 0.8)
          .style("--departure-ratio", (d) =>
            d.totalTraffic === 0
              ? 0.5
              : stationFlow(d.departures / d.totalTraffic)
          )
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

        function updateVisualization() {
          // Update radius scale with filtered data
          const radiusScale = d3
            .scaleSqrt()
            .domain([0, d3.max(filteredStations, (d) => d.totalTraffic)])
            .range(timeFilter === -1 ? [3, 15] : [3, 25]);

          // Update circles with immediate transition
          circles
            .data(filteredStations)
            .transition()
            .duration(100)
            .attr("r", (d) => radiusScale(d.totalTraffic))
            .style("--departure-ratio", (d) =>
              d.totalTraffic === 0
                ? 0.5
                : stationFlow(d.departures / d.totalTraffic)
            );
        }

        // Pre-process trips into minute buckets
        trips.forEach((trip) => {
          const startedMinutes = minutesSinceMidnight(
            new Date(trip.started_at)
          );
          const endedMinutes = minutesSinceMidnight(new Date(trip.ended_at));

          departuresByMinute[startedMinutes].push(trip);
          arrivalsByMinute[endedMinutes].push(trip);
        });

        function filterTripsbyTime() {
          if (timeFilter === -1) {
            // Use all trips
            filteredArrivals = d3.rollup(
              trips,
              (v) => v.length,
              (d) => d.end_station_id
            );

            filteredDepartures = d3.rollup(
              trips,
              (v) => v.length,
              (d) => d.start_station_id
            );
          } else {
            // Use filtered trips
            const filteredDepartureTrips = filterByMinute(
              departuresByMinute,
              timeFilter
            );
            const filteredArrivalTrips = filterByMinute(
              arrivalsByMinute,
              timeFilter
            );

            filteredDepartures = d3.rollup(
              filteredDepartureTrips,
              (v) => v.length,
              (d) => d.start_station_id
            );

            filteredArrivals = d3.rollup(
              filteredArrivalTrips,
              (v) => v.length,
              (d) => d.end_station_id
            );
          }

          // Update station data with filtered traffic
          filteredStations = stations.map((station) => ({
            ...station,
            arrivals: filteredArrivals.get(station.short_name) ?? 0,
            departures: filteredDepartures.get(station.short_name) ?? 0,
            totalTraffic:
              (filteredArrivals.get(station.short_name) ?? 0) +
              (filteredDepartures.get(station.short_name) ?? 0),
          }));

          updateVisualization();
        }

        // Initial filter
        filterTripsbyTime();

        // Add time slider event listener
        d3.select("#time-slider").on("input", function () {
          timeFilter = +this.value;
          if (timeFilter === -1) {
            d3.select("#any-time").style("display", "block");
            d3.select("#selected-time").style("display", "none");
          } else {
            const hours = Math.floor(timeFilter / 60);
            const minutes = timeFilter % 60;
            d3.select("#selected-time")
              .text(
                `${hours.toString().padStart(2, "0")}:${minutes
                  .toString()
                  .padStart(2, "0")}`
              )
              .style("display", "block");
            d3.select("#any-time").style("display", "none");
          }
          filterTripsbyTime();
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
