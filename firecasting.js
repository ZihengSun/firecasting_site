function parse_date_string(str) {
    var y = str.substr(0,4),
        m = str.substr(4,2) - 1,
        d = str.substr(6,2);
    var D = new Date(y,m,d);
    return (D.getFullYear() == y && D.getMonth() == m && D.getDate() == d) ? D : 'invalid date';
}

var map, layercontrol;

function loadMap() {
    
    // Get the Leaflet map container
    map = L.map('map',  { zoomControl: false }).setView([0, 0], 2);

    var basemaps = {
        
        Topography: L.tileLayer.wms('http://ows.mundialis.de/services/service?', {
            layers: 'TOPO-WMS'
        }),

        Places: L.tileLayer.wms('http://ows.mundialis.de/services/service?', {
            layers: 'OSM-WMS'
        }),

        'SatelliteImagery': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/'+
            '/tile/{z}/{y}/{x}', {
            attribution: 'Esri',
            maxZoom: 19
        }),
    };

    basemaps.SatelliteImagery.addTo(map);

    // Add layer control to the map
    layercontrol = L.control.layers(basemaps).addTo(map);

    // Add zoom control to the top right corner
    L.control.zoom({ position: 'topright' }).addTo(map);
    
    var usaBounds = [
       // -125, 25, -100, 49
       [25, -125.000000], // Southwest
       [49, -100]   // Northeast
    ];

    // Fit the map to the bounding box
    map.fitBounds(usaBounds);

    fetch('us-states.json').then(function(response) {
        return response.json();
    })
    .then(function(data) {
        // Add the county boundaries layer to the map
        var geojsonStyle = {
            color: '#000000', // Red color
            weight: 1 // Line width
        };

        // Add the county boundaries layer to the map with custom style
        var geojsonLayer = L.geoJSON(data, {
            style: geojsonStyle
        });
        geojsonLayer.addTo(map);
        geojsonLayer.bringToFront(); // Bring the GeoJSON layer to the top
    });

    // Function to handle the click event and display popup
    map.on('click', function(e) {
        var lat = e.latlng.lat.toFixed(6);
        var lon = e.latlng.lng.toFixed(6);

        var content;

        var featureTableId = `feature_table_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        // Construct content from parsed data
        content = `<strong>Coordinates:</strong><br>Latitude: ${lat}<br>Longitude: ${lon}<br><button onclick="copyCoordinates('${lat}', '${lon}')">Copy Coordinates</button><br><strong>Feature Info:</strong><br><div id="`+featureTableId+`"></div>`;
        
        // Display the response data or error in the popup
        L.popup()
            .setLatLng(e.latlng)
            .setContent(content)
            .openOn(map);

        var visible_layers = getActiveLayers(this);
        
        visible_layers.forEach(layer => {
            getWmsFeatureInfoForLayer(lat, lon, layer, function (error, parsedData, layerName) {
                if (!error && parsedData && parsedData["value_0"]) {
                    $("#"+featureTableId).append(`<strong>${layerName}:</strong> ${parsedData["value_0"]}<br>`);
                }
            });
        });
        
    });

}

function parseLayerName(layerString) {
    // Regular expression to capture the main layer name and the two dates
    var regex = /^(.+?\.pkl)-(\d{8}) - (\d{8})$/;
    var match = layerString.match(regex);

    if (match) {
        return {
            layerName: match[1], // Extracted layer name before the first hyphen-date
            startDate: match[2], // Convert YYYYMMDD to YYYY-MM-DD
            endDate: match[3]    // Convert YYYYMMDD to YYYY-MM-DD
        };
    } else {
        console.error("Invalid layer name format:", layerString);
        return null;
    }
}

// Function to get active layer names dynamically from the map
function getActiveLayers(map) {
    var activeLayers = [];
    
    // Loop through all layers on the map and check if they are visible
    map.eachLayer(function(layer) {
        if (layer instanceof L.TileLayer) {
            // If layer is a TileLayer (WMS), check its visibility
            if (typeof layer.options.display_name !== "undefined") {
                activeLayers.push(layer.options.display_name);
            }
        }
    });
    
    return activeLayers;  // Return array of active layer names
}

// Function to get WMS GetFeatureInfo request URL and fetch the feature info for a specific layer
function getWmsFeatureInfoForLayer(lat, lon, layer, callback) {
    // Define bounding box for the clicked location (0.001 degree buffer around the clicked point)
    var bbox = `${lon - 0.001},${lat - 0.001},${lon + 0.001},${lat + 0.001}`;


    var layer_obj = parseLayerName(layer)

    // Layer-specific properties (could be different for each layer)
    var wmsUrl = '../cgi-bin/mapserv?'; // Adjust to your server URL
    var map = '/var/www/html/wildfire_site/data/'+layer_obj.layerName+'/'+layer_obj.startDate+'/firedata_'+layer_obj.endDate+'_predicted.txt_output.tif.map';
    var styles = '';  // Specify styles for each layer, if any
    var format = 'image/png';
    var version = '1.1.1';
    var srs = 'EPSG:4326';  // Standard coordinate system
    var width = 10;  // Width of the image
    var height = 10;  // Height of the image
    var infoFormat = 'text/plain'; // Response format

    // Construct GetFeatureInfo request URL for this specific layer
    var url = `${wmsUrl}map=${map}&service=WMS&request=GetFeatureInfo&layers=wildfiremap&styles=${styles}&format=${format}&version=${version}&srs=${srs}&width=${width}&height=${height}&bbox=${bbox}&query_layers=wildfiremap&info_format=${infoFormat}&x=128&y=128`;

    // Fetch feature information for this layer
    fetch(url)
        .then(response => response.text())  // Adjust according to the 'info_format' (text or JSON)
        .then(data => {
            // Parse the response text for this layer
            var parsedData = parseWmsFeatureInfo(data);
            callback(null, parsedData, layer);  // Call the callback with parsed data for this layer
        })
        .catch(error => {
            console.error("Error fetching feature info for layer:", error);
            callback(error, null, layer);  // Call the callback with error for this layer
        });
}

// Function to parse WMS GetFeatureInfo response text
function parseWmsFeatureInfo(response) {
    // Create a result object to hold the parsed data
    var result = {};
    
    // Regular expression to capture key-value pairs
    var regex = /([a-zA-Z0-9_]+)\s*=\s*'([^']+)'/g;
    var match;
    
    // Iterate over all matches in the response string
    while ((match = regex.exec(response)) !== null) {
        var key = match[1];   // Extract the key
        var value = match[2]; // Extract the value
        
        // Store the key-value pair in the result object
        result[key] = value;
    }
    
    return result;
}

// Function to copy coordinates to clipboard
function copyCoordinates(lat, lon) {
    const textToCopy = `${lat}, ${lon}`;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                alert('Coordinates copied to clipboard!');
            })
            .catch(err => {
                console.error('Failed to copy: ', err);
            });
    } else {
        // Fallback for older browsers
        var tempInput = document.createElement('input');
        tempInput.value = textToCopy;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        alert('Coordinates copied to clipboard!');
    }
}

function convert_date_str(dateString){
    let dateobj = new Date(dateString);
    let year = dateobj.getFullYear();
    let month = String(dateobj.getMonth() + 1).padStart(2, '0');
    let day = String(dateobj.getDate()).padStart(2, '0');

    let formattedDate = year + month + day;
    return formattedDate
}

function add_wildfire_predicted_geotiff(foldername, eyedate, predict_dateString){
    if (!predict_dateString) {
        return;
    }
    console.log("adding the layer of prediction of "+predict_dateString + "from base date "+eyedate)

    layer_name = foldername + "-" + eyedate +" - "+predict_dateString
    console.log("layer_name = "+layer_name)
    
    // URL to your GeoTIFF file - firedata_20210717_predicted.txt_output.tif
    var wmslayer = L.tileLayer.wms(
        'http://geobrain.csiss.gmu.edu/cgi-bin/mapserv?'+
        'map=/var/www/html/wildfire_site/data/'+foldername+'/'+eyedate+'/firedata_'+
        predict_dateString+'_predicted.txt_output.tif.map&',
        {
                layers: 'wildfiremap',
                format: 'image/png',
                transparent: true,
                display_name: layer_name,
        }
    );
    wmslayer.addTo(map);
    
    layercontrol.addOverlay(wmslayer, layer_name);

}

dateArray_for_picker1 = []
dateArray_for_picker2 = []
latest_date_for_picker1 = ""
latest_date_for_picker2 = ""

function setup_datepicker2(dateArray_for_picker2=[], latest_date_for_picker2=null){
    $('#datepicker2').datepicker({
        format: 'yyyy/mm/dd',
        todayHighlight: true,
        timeZone: 'America/Los_Angeles',
        autoclose: true,
        beforeShowDay: function(date) {
            // Convert date to yyyy-mm-dd format
            var formattedDate = date.getFullYear() + '-' + 
                ('0' + (date.getMonth() + 1)).slice(-2) + '-' + 
                ('0' + date.getDate()).slice(-2);

            // Check if the date is in the dateArray
            return dateArray_for_picker2.includes(formattedDate);
        }
    });
}

function setup_datepicker(datepicker_id, dateArray_for_picker=[], latest_date_for_picker=null) {

    $("#" + datepicker_id).datepicker('destroy');

    $("#" + datepicker_id).datepicker({
        format: 'yyyy/mm/dd',  // Updated format to yyyy-mm-dd
        todayHighlight: true,
        autoclose: true,
        beforeShowDay: function(date) {
            if (!Array.isArray(dateArray_for_picker)) {
                console.error("dateArray_for_picker is not an array:", dateArray_for_picker);
                return [true]; // Default to selectable if it's not an array
            }

            // Convert date to yyyy-mm-dd format for comparison
            var formattedDate = date.getFullYear() + 
                ('0' + (date.getMonth() + 1)).slice(-2) + 
                ('0' + date.getDate()).slice(-2);

            // Check if the formatted date is in the dateArray
            let isin = dateArray_for_picker.includes(formattedDate);
            return isin
        }
    }).on("changeDate", function(e) {
        $(this).datepicker('hide'); // Force close after selecting a date
    });

    // Set the latest date as the default value
    if (latest_date_for_picker) {
        console.log("Setting " + datepicker_id + " to " + latest_date_for_picker);

        // Convert latest_date_for_picker from yyyymmdd to yyyy-mm-dd format
        var formattedLatestDate = latest_date_for_picker.slice(0, 4) + '/' + 
                                  latest_date_for_picker.slice(4, 6) + '/' + 
                                  latest_date_for_picker.slice(6, 8);

        // Convert to Date object and set the date
        var latestDateObject = new Date(formattedLatestDate);
        if (!isNaN(latestDateObject)) {
            $("#" + datepicker_id).datepicker('setDate', latestDateObject);
        } else {
            console.error('Invalid date format:', latest_date_for_picker);
        }
    } else {
        // If no latest date is provided, set the last date in the array as the default value
        if (dateArray_for_picker.length > 0) {
            var lastDate = dateArray_for_picker[dateArray_for_picker.length - 1];

            // Convert lastDate from yyyymmdd to yyyy-mm-dd format
            var formattedLastDate = lastDate.slice(0, 4) + '/' + 
                                    lastDate.slice(4, 6) + '/' + 
                                    lastDate.slice(6, 8);

            // Convert to Date object and set the date
            var lastDateObject = new Date(formattedLastDate);
            if (!isNaN(lastDateObject)) {
                $("#" + datepicker_id).datepicker('setDate', lastDateObject);
            } else {
                console.error('Invalid last date format:', lastDate);
            }
        }
    }
}


// Function to find the latest date
function findLatestDate(dates) {
    if (dates.length === 0) {
        return null; // Return null for an empty array
    }

    // Use reduce to find the maximum date
    var latestDate = dates.reduce(function (maxDate, currentDate) {
        maxDateObject = new Date(maxDate)
        currentDateObject = new Date(currentDate)
        return currentDateObject > maxDateObject ? currentDate : maxDate;
    });

    return latestDate;
}

function remove_dash_in_date_str(originalDate){

    // Original date string
    // var originalDate = "2021-08-11";

    // Parse the original date string into a Date object
    var date = new Date(originalDate);

    // Get the year, month, and day components
    var year = date.getFullYear();
    var month = ('0' + (date.getMonth() + 1)).slice(-2); // Adding 1 because months are zero-indexed
    var day = ('0' + date.getDate()).slice(-2);

    // Reformat the date string
    var reformattedDate = year + month + day;

    //console.log(reformattedDate); // Output: 20210811
    return reformattedDate
}

function refresh_calendar2(eye_date){
    reformat_eye_date_str = remove_dash_in_date_str(eye_date)
    console.log("start to refresh calendar 2 ../wildfire_site/data/"+reformat_eye_date_str+"/date_list.csv")
    
    fetch('../wildfire_site/data/'+reformat_eye_date_str+'/date_list.csv', {
        method: 'GET',
        cache: 'no-store', // 'no-store' disables caching
      })
        .then(response => response.text())
        .then(data => {
            console.log("calendar2 response = " + data)
            // Parse CSV data and convert the date column into an array
            Papa.parse(data, {
                header: true,
                complete: function(results) {
                    // Assuming 'date' is the name of your date column
                    dateArray_for_picker2 = results.data.map(function(row) {
                        return row.date;
                    });
                    if (dateArray_for_picker2.length === 0) {
                        console.log("dateArray_for_picker2 is empty");
                        return;
                    }
                    console.log("dateArray_for_picker2 = " + dateArray_for_picker2)
                    setup_datepicker2()
                    
                    // found the latest date and show on the map
                    var latestdate = findLatestDate(dateArray_for_picker2)
                    console.log("Found latest date is " + latestdate + " setting picker 2 to it")
                    $('#datepicker2').datepicker('setDate', new Date(latestdate));
                    console.log("current base date is " + eye_date)
                    add_wildfire_predicted_geotiff(reformat_eye_date_str, latestdate)
                }
            });
    
        })
        .catch(error => console.error('Error fetching CSV file:', error));
    
}

function get_date_str_with_dash(date_str_with_dash){
    var startDate = new Date(date_str_with_dash);
    startDate.setDate(startDate.getDate() + 1);
    var year = startDate.getFullYear();
    var month = ('0' + (startDate.getMonth() + 1)).slice(-2); // Adding 1 because months are zero-indexed
    var day = ('0' + startDate.getDate()).slice(-2);

    // Reformat the date string
    var eyedate_str = year + "-" + month + "-" + day;
    return eyedate_str
}

function refresh_calendar(){
    $('#datepicker1').datepicker().on("changeDate", function(selected) {
        let eyedate_str = get_date_str_with_dash(selected.date.valueOf())
        refresh_calendar2(eyedate_str)
    });

    // Fetch the CSV file
    fetch('../wildfire_site/data/eye_date_list.csv', {
        method: 'GET',
        cache: 'no-store', // 'no-store' disables caching
    })
    .then(response => response.text())
    .then(data => {
        console.log(data)
        // Parse CSV data and convert the date column into an array
        Papa.parse(data, {
            header: true,
            complete: function(results) {
                // Assuming 'date' is the name of your date column
                dateArray_for_picker1 = results.data.map(function(row) {
                    return row.date;
                });
                if (dateArray_for_picker1.length === 0) {
                    console.log("dateArray_for_picker1 is empty");
                    return;
                }
                console.log("dateArray_for_picker1 = " + dateArray_for_picker1)
                
                $('#datepicker1').datepicker({
                    beforeShowDay: function(date) {
                        // Convert date to yyyy-mm-dd format
                        var formattedDate = date.getFullYear() + '-' + 
                            ('0' + (date.getMonth() + 1)).slice(-2) + '-' + 
                            ('0' + date.getDate()).slice(-2);
            
                        // Check if the date is in the dateArray
                        return dateArray_for_picker1.includes(formattedDate);
                    }
                });

                // found the latest date and show on the map
                var latestdate = findLatestDate(dateArray_for_picker1)
                console.log("Found latest base date is " + latestdate + "setting picker1 to it")
                $('#datepicker1').datepicker('setDate', new Date(latestdate));
                $('#datepicker1').datepicker('update');
                refresh_calendar2(latestdate)
            }
        });

    })
    .catch(error => console.error('Error fetching CSV file:', error));

        
    
}

function load_predicted_frp_to_map(){
    // Get the selected date from the datepicker
    var foldername = $("#folderpicker").val()
    var eyeDate = $('#datepicker1').datepicker('getFormattedDate');
    var selectedDate = $('#datepicker2').datepicker('getFormattedDate');
    console.log("loading layer for "+ selectedDate)
    // Remove slashes to get "yyyymmdd" format
    var eyeDateFormatted = eyeDate.replace(/\//g, ""); 
    var selectedDateFormatted = selectedDate.replace(/\//g, "");
    // Show overlay with selected date
    add_wildfire_predicted_geotiff(foldername, eyeDateFormatted, selectedDateFormatted);
}

function add_listener_to_buttons(){

    // Button click listener
    $('#load_wildfire_to_map').on('click', load_predicted_frp_to_map);

    // Close overlay button click listener
    $('#download_wildfire_geotiff').on('click', function() {
        // Create a temporary anchor element
        var eyeDate = $('#datepicker1').datepicker('getFormattedDate');
        var selectedDate = $('#datepicker2').datepicker('getFormattedDate');
        console.log("downloading geotiff for "+ selectedDate)
        no_dash_date = remove_dash_in_date_str(eyeDate)
        // Open a new window to initiate the download
        window.open("../wildfire_site/data/"+no_dash_date+"/firedata_"+no_dash_date+"_predicted.txt_output.tif", '_blank');
    });

    $('#datepicker2').datepicker().on("changeDate", function(selected) {
        load_predicted_frp_to_map();
        $(this).datepicker('hide');
    });

}

function getColor(d) {
    // Specify the number of classes (baskets)
    // var numClasses = 10;
  
    // // Generate grades dynamically based on the number of classes
    // var grades = Array.from({ length: numClasses + 1 }, function (_, index) {
    //   return (30 / numClasses) * index;
    // });
  
    // // Define color scale from gray to blue to purple
    // var colorScale = chroma.scale(['#f0f0f0', '#4d4dff', '#9900cc']).mode('lab').colors(numClasses);

    // // 
  
    // // Find the appropriate color class based on the input value
    // for (var i = 0; i < grades.length - 1; i++) {
    //   if (d >= grades[i] && d < grades[i + 1]) {
    //     return colorScale[i];
    //   }
    // }

    // console.log(colorScale)

    // Define color classes
    var colors = ['#FFFFFF', '#FFEBAF', '#FFC864', '#FF9632', '#FF6400', 
        '#C80000', '#8B0000',]

    // Specify the number of classes (baskets)
    var numClasses = 7;

    // Generate grades dynamically based on the number of classes
    var grades = [20, 50, 100, 150, 200, 300, 500]

    // Find the appropriate color class based on the input value
    for (var i = 0; i < grades.length - 1; i++) {
        if (d >= grades[i] && d < grades[i + 1]) {
            return colors[i];
        }
    }

    // Handle the case where the input value is greater than the last grade
    return colors[grades.length - 1];
  }

function add_legend(){
    // Your MapServer configuration with 15 classes
    var legend = L.control({position: 'bottomright'});

    legend.onAdd = function (map) {

        var div = L.DomUtil.create('div', 'info legend'),
            labels = [];

        div.style.backgroundColor = 'white';
        div.style.padding = '10px';
        // Specify the number of classes (baskets)
        var numClasses = 10;
        
        // Generate grades dynamically based on the number of classes
        var grades = [20, 50, 100, 150, 200, 300, 500]

        // loop through our density intervals and generate a label with a colored square for each interval
        for (var i = 0; i < grades.length; i++) {
            div.innerHTML +=
                '<i style="background:' + getColor(grades[i] + 1) + '"></i> ' +
                grades[i] + (grades[i + 1] ? '&ndash;' + grades[i + 1] + '<br>' : '+');
        }

        return div;
    };

    legend.addTo(map);
}

function add_folder_picker(){
    $("#folderpicker").on("click", function(){
        
    })
}

function parseCSVToJSON(csvData) {
    let folderMap = {};

    let lines = csvData.trim().split("\n");

    lines.forEach(line => {
        let [folder, eyeDate, forecastFile] = line.split(",");
        let forecastDate = forecastFile.match(/_(\d{8})_/)[1]; // Extract date from filename

        if (!folderMap[folder]) {
            folderMap[folder] = {};
        }
        if (!folderMap[folder][eyeDate]) {
            folderMap[folder][eyeDate] = [];
        }

        folderMap[folder][eyeDate].push(forecastDate);
    });

    return folderMap;
}

var FC = {
    global_folder_data_mapper: {}
}

function refresh_folderlist(){
    // fetch('../wildfire_site/data/map_folder_dates.csv', {
    fetch('test_map_folder_dates.csv', {
        method: 'GET',
        cache: 'no-store', // 'no-store' disables caching
    })
    .then(response => response.text())
    .then(data => {
        FC.global_folder_data_mapper = parseCSVToJSON(data)
        console.log(FC.global_folder_data_mapper)
        populateFolderPicker(FC.global_folder_data_mapper);
    })
}

// Function to populate folder picker
function populateFolderPicker(folderMap) {
    var folderPicker = $('#folderpicker');
    folderPicker.empty(); // Clear previous options

    let folders = Object.keys(folderMap);


    if (folders.length === 0) return;

    folders.forEach((folder, index) => {
        var option = $('<option>', {
            value: folder,
            text: folder
        });

        if (index === 0) {
            option.attr("selected", "selected"); // Select the first one by default
        }

        folderPicker.append(option);
    });

    // Trigger an event to update dependent elements when a folder is selected
    folderPicker.trigger('change');
}

function setup_folder_picker() {
    var folderOptions = []; // This is an example. Dynamically populate as needed.

    var folderPicker = $('#folderpicker');
    folderOptions.forEach(function(folder) {
        var option = $('<option>', {
            value: folder,
            text: folder
        });
        folderPicker.append(option);
    });

    // Handle folder selection
    folderPicker.on('change', function() {
        var selectedFolder = $(this).val();
        console.log("Folder selected: " + selectedFolder);
        // Add any functionality you'd like when a folder is selected.
        populate_datepicker1(selectedFolder)
    });
}

function populate_datepicker1(selected_folder){
    var available_base_dates = FC.global_folder_data_mapper[selected_folder]
    // Extract keys from the object and store them in an array
    var keysArray = Object.keys(available_base_dates);
    keysArray.sort((a, b) => b.localeCompare(a));
    console.log("date picker 1 list of dates: " + keysArray)
    setup_datepicker("datepicker1", keysArray, keysArray[0])
    populate_datepicker2(selected_folder, keysArray[0])
}

function populate_datepicker2(selected_folder, base_date){
    var available_forecasting_dates = FC.global_folder_data_mapper[selected_folder][base_date]
    available_forecasting_dates.sort((a, b) => b.localeCompare(a));
    console.log("date picker 2 list of dates: " + available_forecasting_dates)
    setup_datepicker("datepicker2", available_forecasting_dates, available_forecasting_dates[0])
    
}

// Automatically load the map when the document is ready
document.addEventListener('DOMContentLoaded', function() {
    loadMap();
    setup_datepicker("datepicker1", [], null);
    setup_datepicker("datepicker2", [], null);
    setup_folder_picker()
    // setup_datepicker2()
    // setup_datepicker1()
    refresh_folderlist()
    // refresh_calendar()
    add_listener_to_buttons()
    add_legend()
    // trigger the load
    load_predicted_frp_to_map()
});
