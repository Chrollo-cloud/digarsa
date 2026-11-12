import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./location.css";

// Buyer coordinates control the private map viewport and picker only.
// They are never added to public service markers or application URLs.
export default function LocationMap({
  points = [],
  center = null,
  viewCenter = null,
  centerLabel = "Lokasi pencarian kamu",
  focusId = "",
  selectedId = "",
  onSelect,
  onPick,
  selection = null,
  selectionLabel = "Titik draf layanan publik",
}) {
  const host = useRef(null);
  const instance = useRef(null);
  const layers = useRef(null);
  const buyerLayer = useRef(null);

  const handlers = useRef({ onSelect, onPick });
  const [tileError, setTileError] = useState(false);

  // Keep the latest callbacks without recreating the map.
  useEffect(() => {
    handlers.current = { onSelect, onPick };
  }, [onSelect, onPick]);

  // Initialize the Leaflet map once.
  useEffect(() => {
    if (!host.current) return;

    const map = L.map(host.current, {
      center: [-2.5, 118],
      zoom: 4,
      minZoom: 2,
      maxZoom: 18,
      scrollWheelZoom: true,
      wheelDebounceTime: 80,
      wheelPxPerZoomLevel: 80,
      zoomAnimation: true,
      fadeAnimation: false,
      markerZoomAnimation: false,
      inertia: false,
    });

    instance.current = map;

    layers.current = L.layerGroup().addTo(map);
    buyerLayer.current = L.layerGroup().addTo(map);

    const tile = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      },
    ).addTo(map);

    const failed = () => setTileError(true);
    const loaded = () => setTileError(false);

    tile.on("tileerror", failed);
    tile.on("load", loaded);

    // Clicking the map selects a new private address point.
    map.on("click", (event) => {
      handlers.current.onPick?.({
        lat: Number(event.latlng.lat.toFixed(6)),
        lng: Number(event.latlng.wrap().lng.toFixed(6)),
      });
    });

    const resize = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });

    resize.observe(host.current);

    return () => {
      resize.disconnect();
      tile.off("tileerror", failed);
      tile.off("load", loaded);

      map.remove();

      instance.current = null;
      layers.current = null;
      buyerLayer.current = null;
    };
  }, []);

  // Render public service markers.
  useEffect(() => {
    const layer = layers.current;
    if (!layer) return;

    layer.clearLayers();

    points.forEach((point, index) => {
      const selected = point.id === selectedId;

      const marker = L.marker(
        [point.coordinates.lat, point.coordinates.lng],
        {
          keyboard: true,
          title: `Pilih layanan: ${point.title}`,
          alt: `Pilih layanan: ${point.title}`,
          icon: L.divIcon({
            className: `location-pin${selected ? " is-selected" : ""}`,
            html: `<span><b>${index + 1}</b></span>`,
            iconSize: [36, 42],
            iconAnchor: [18, 42],
          }),
        },
      ).addTo(layer);

      // Build popup content using textContent to avoid interpreting
      // service information as HTML.
      const copy = document.createElement("div");

      const title = document.createElement("strong");
      title.textContent = point.title;
      copy.appendChild(title);

      const note = document.createElement("p");
      note.textContent = "Titik publik dikonfirmasi kreator";
      copy.appendChild(note);

      marker.bindPopup(copy, { autoPan: false });

      marker.on("click", () => {
        handlers.current.onSelect?.(point.id);
      });

      marker.getElement()?.setAttribute(
        "aria-pressed",
        String(selected),
      );

      marker
        .getElement()
        ?.setAttribute(
          "aria-label",
          `Pilih layanan: ${point.title}`,
        );

      if (selected) marker.openPopup();
    });
  }, [points, selectedId]);
  const selectionLat = selection?.lat, selectionLng = selection?.lng;
  useEffect(() => {
    if (selectionLat === undefined || selectionLng === undefined) return;
    const marker = L.marker([selectionLat, selectionLng], {
      draggable: true,
      keyboard: true,
      title: `${selectionLabel}; geser atau ubah koordinat pada formulir`,
      alt: selectionLabel,
      icon: L.divIcon({
        className: "location-selection-pin",
        html: '<span aria-hidden="true">⌖</span>',
        iconSize: [40, 40],
        iconAnchor: [20, 40],
      }),
    }).addTo(instance.current);
    marker.on("dragend", () => {
      const value = marker.getLatLng().wrap();
      handlers.current.onPick?.({
        lat: Number(value.lat.toFixed(6)), lng: Number(value.lng.toFixed(6)),
      });
    });
    return () => marker.remove();
  }, [selectionLat, selectionLng, selectionLabel]);

  // The map viewport can follow a selected administrative area
  // even before the user has selected an exact address point.
  const effectiveCenter = viewCenter || center;

  const viewKey = JSON.stringify({
    center: effectiveCenter,
    bounds: points.map((point) => [
      point.coordinates.lat,
      point.coordinates.lng,
    ]),
  });
  useEffect(() => {
    const map = instance.current;
    if (!map) return;

    const view = JSON.parse(viewKey);

    if (view.center) {
      map.setView(
        [view.center.lat, view.center.lng],
        13,
        { animate: false },
      );
    } else if (view.bounds.length) {
      map.fitBounds(
        L.latLngBounds(view.bounds),
        {
          padding: [45, 45],
          maxZoom: 14,
          animate: false,
        },
      );
    } else {
      map.setView([-2.5, 118], 4, { animate: false });
    }
  }, [viewKey]);

  // Render the private buyer location or draggable address marker.
  const centerLat = center?.lat;
  const centerLng = center?.lng;
  const hasPickHandler = Boolean(onPick);
  const hasSelection = Boolean(selection);
  useEffect(() => {
    const layer = buyerLayer.current;
    if (!layer) return;

    layer.clearLayers();

    if (centerLat === undefined || centerLng === undefined || hasSelection) return;

    if (hasPickHandler) {
      // Address mode: the user can drag this marker.
      const marker = L.marker(
        [centerLat, centerLng],
        {
          draggable: true,
          keyboard: true,
          title: centerLabel,
          alt: centerLabel,
        },
      ).addTo(layer);

      const popupContent = document.createElement("span");
      popupContent.textContent = centerLabel;

      marker.bindPopup(popupContent);

      marker.on("dragend", () => {
        const point = marker.getLatLng();

        handlers.current.onPick?.({
          lat: Number(point.lat.toFixed(6)),
          lng: Number(point.wrap().lng.toFixed(6)),
        });
      });

      return;
    }

    // Existing buyer-location mode: show a private circle marker.
    const popupContent = document.createElement("span");
    popupContent.textContent = centerLabel;

    L.circleMarker(
      [centerLat, centerLng],
      {
        radius: 10,
        color: "#ffffff",
        weight: 4,
        fillColor: "#0797c2",
        fillOpacity: 1,
      },
    )
      .bindPopup(popupContent)
      .addTo(layer);
  }, [
    centerLat,
    centerLng,
    centerLabel,
    hasPickHandler,
    hasSelection,
  ]);

  // Focus a selected public service.
  const focused = points.find(
    (point) => point.id === focusId,
  )?.coordinates;

  const focusLat = focused?.lat;
  const focusLng = focused?.lng;

  useEffect(() => {
    if (focusLat !== undefined && focusLng !== undefined) {
      instance.current?.panTo(
        [focusLat, focusLng],
        { animate: false },
      );
    }
  }, [focusId, focusLat, focusLng]);

  return (
    <div className="location-map-wrap">
      <div
        className="location-map"
        ref={host}
        role="region"
        aria-label={
          onPick
            ? "Peta pilihan titik alamat. Klik peta atau geser pin untuk memilih lokasi."
            : "Peta lokasi layanan. Gunakan daftar hasil sebagai alternatif keyboard."
        }
      />

      {tileError && (
        <p className="location-map-error" role="status">
          Latar peta belum dapat dimuat. Pin dan daftar tetap
          dapat digunakan; periksa koneksi internet.
        </p>
      )}

      <p className="location-map-note">
        Peta OpenStreetMap · Geser pin atau gunakan tombol
        +/− untuk mengatur tampilan. Tidak ada rute atau
        estimasi perjalanan.{" "}
        <a
          href="https://www.openstreetmap.org/fixthemap"
          target="_blank"
          rel="noreferrer"
        >
          Laporkan masalah peta →
        </a>
      </p>
    </div>
  );
}
