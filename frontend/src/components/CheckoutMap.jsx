import React, { useState, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, Autocomplete } from '@react-google-maps/api';
import { LocateFixed } from 'lucide-react';

// Set your supermarket's exact coordinates here
const STORE_LOCATION = { lat: 6.9271, lng: 79.8612 }; 

const mapContainerStyle = { width: '100%', height: '100%' };

// We load the 'places' library for search functionality
const libraries = ['places'];

function CheckoutMap({ onLocationSelect, onDistanceCalculated }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',            // MUST match DriverDashboard.jsx
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries,
  });

  const [markerPos, setMarkerPos] = useState(STORE_LOCATION);
  const mapRef = useRef();
  const autocompleteRef = useRef();

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
    // Attempt to get user's live location immediately on load
    handleCurrentLocation();
  }, []);

  // FEATURE 1: Use Current Location
  const handleCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLoc = { lat: position.coords.latitude, lng: position.coords.longitude };
          setMarkerPos(userLoc);
          
          if (mapRef.current) {
            mapRef.current.panTo(userLoc);
            mapRef.current.setZoom(16);
          }
          processNewLocation(userLoc);
        },
        (error) => console.log("User denied geolocation or it failed:", error)
      );
    } else {
      alert("Geolocation is not supported by your browser.");
    }
  };

  // FEATURE 2: Enter the Address via Autocomplete
  const onLoadAutocomplete = (autocomplete) => {
    autocompleteRef.current = autocomplete;
  };

  const onPlaceChanged = () => {
    if (autocompleteRef.current !== null) {
      const place = autocompleteRef.current.getPlace();
      
      // Ensure the user actually selected a valid place from the dropdown
      if (place.geometry && place.geometry.location) {
        const newPos = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        };
        
        setMarkerPos(newPos);
        if (mapRef.current) {
          mapRef.current.panTo(newPos);
          mapRef.current.setZoom(16);
        }
        
        // Pass the new coordinates and the nicely formatted address directly
        processNewLocation(newPos, place.formatted_address);
      }
    }
  };

  // Manual map clicks and drags
  const handleMapClick = (event) => {
    const newPos = { lat: event.latLng.lat(), lng: event.latLng.lng() };
    setMarkerPos(newPos);
    processNewLocation(newPos);
  };

  // Core Distance & Address Processor
  const processNewLocation = (location, knownAddress = null) => {
    if (!window.google) return;

    // 1. Calculate driving distance to the store (Distance Matrix)
    const distanceService = new window.google.maps.DistanceMatrixService();
    distanceService.getDistanceMatrix({
      origins: [STORE_LOCATION],
      destinations: [location],
      travelMode: window.google.maps.TravelMode.DRIVING,
    }, (response, status) => {
      if (status === "OK" && response.rows[0].elements[0].status === "OK") {
        const distanceMeters = response.rows[0].elements[0].distance.value;
        const distanceKm = distanceMeters / 1000;
        onDistanceCalculated(distanceKm);
      } else {
        console.error("Distance Matrix failed:", status);
        onDistanceCalculated(0);
      }
    });

    // 2. Geocoding (Convert coordinates to text ONLY if we don't already have the address from Autocomplete)
    if (knownAddress) {
      onLocationSelect(knownAddress, location.lat, location.lng);
    } else {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location }, (results, status) => {
        if (status === "OK" && results[0]) {
          onLocationSelect(results[0].formatted_address, location.lat, location.lng);
        } else {
          onLocationSelect("Custom Map Location", location.lat, location.lng);
        }
      });
    }
  };

  if (loadError) return <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>Error loading Google Maps. Check API Key.</div>;
  if (!isLoaded) return <div style={{ padding: '20px', textAlign: 'center' }}>Loading Map Engine...</div>;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        zoom={12}
        center={markerPos}
        options={{
          disableDefaultUI: true,
          zoomControl: true,
        }}
        onClick={handleMapClick}
        onLoad={onMapLoad}
      >
        <Marker 
          position={markerPos} 
          draggable={true} 
          onDragEnd={handleMapClick} 
          animation={window.google.maps.Animation.DROP}
        />
        
        {/* TOP UI OVERLAY: Search Bar & Locate Me Button */}
        <div style={{ position: 'absolute', top: '15px', left: '50%', transform: 'translateX(-50%)', width: '90%', zIndex: 5, display: 'flex', gap: '10px' }}>
          
          <div style={{ flex: 1 }}>
            <Autocomplete onLoad={onLoadAutocomplete} onPlaceChanged={onPlaceChanged}>
              <input
                type="text"
                placeholder="Search your delivery address..."
                style={{
                  width: '100%',
                  padding: '12px 15px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-light)',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                  margin: 0,
                  fontSize: '14px',
                  outline: 'none',
                  backgroundColor: 'white',
                  color: 'var(--text-main)'
                }}
              />
            </Autocomplete>
          </div>
          
          <button 
            type="button" 
            onClick={handleCurrentLocation}
            style={{
              padding: '10px 15px',
              backgroundColor: 'white',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
              border: '1px solid var(--border-light)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              color: 'var(--color-primary)',
              whiteSpace: 'nowrap'
            }}
            title="Use Current Location"
          >
            <LocateFixed size={18} /> Locate Me
          </button>
        </div>

      </GoogleMap>
      
      {/* Helper text overlay */}
      <div style={{ position: 'absolute', bottom: '15px', left: '50%', transform: 'translateX(-50%)', backgroundColor: 'white', padding: '6px 18px', borderRadius: '20px', fontSize: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', pointerEvents: 'none', fontWeight: '500' }}>
        Search, click, or drag the pin to set location
      </div>
    </div>
  );
}

export default CheckoutMap;