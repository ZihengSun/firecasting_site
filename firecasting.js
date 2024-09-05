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
    map = L.map('map').setView([0, 0], 2);

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
        layercontrol.addOverlay(wmslayer, "Predicted SWE "+date);
    });
}

function convert_date_str(dateString){
    let dateobj = new Date(dateString);
    let year = dateobj.getFullYear();
    let month = String(dateobj.getMonth() + 1).padStart(2, '0');
    let day = String(dateobj.getDate()).padStart(2, '0');

    let formattedDate = year + month + day;
    return formattedDate
}

function add_wildfire_predicted_geotiff(eyedate, predict_dateString){
    if (!predict_dateString) {
        return;
    }
    console.log("adding the layer of prediction of "+predict_dateString + "from eye date "+eyedate)
    if (eyedate.includes('-')) {
        // Remove dashes from the original date string
        eyedate = eyedate.replace(/-/g, '');
    }
    if (predict_dateString.includes('-')) {
        // Remove dashes from the original date string
        predict_dateString = predict_dateString.replace(/-/g, '');
    }
    
    // URL to your GeoTIFF file - firedata_20210717_predicted.txt_output.tif
    var wmslayer = L.tileLayer.wms('http://geobrain.csiss.gmu.edu/cgi-bin/mapserv?'+
            'map=/var/www/html/wildfire_site/data/'+eyedate+'/firedata_'+
            predict_dateString+'_predicted.txt_output.tif.map&', 
            {
                    layers: 'wildfiremap',
                    format: 'image/png',
                    transparent: true
            });
    wmslayer.addTo(map);
    layer_name = "Wildfire Prediction "+ eyedate +" - "+predict_dateString
    console.log("layer_name = "+layer_name)
    layercontrol.addOverlay(wmslayer, layer_name);

}

dateArray_for_picker1 = []
dateArray_for_picker2 = []
latest_date_for_picker1 = ""
latest_date_for_picker2 = ""

function setup_datepicker2(){
    $('#datepicker2').datepicker({
        format: 'yyyy-mm-dd',
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

function setup_datepicker1(){
    $('#datepicker1').datepicker({
        format: 'yyyy-mm-dd',
        todayHighlight: true,
        timeZone: 'America/Los_Angeles',
        autoclose: true,
        beforeShowDay: function(date) {
            // Convert date to yyyy-mm-dd format
            var formattedDate = date.getFullYear() + '-' + 
                ('0' + (date.getMonth() + 1)).slice(-2) + '-' + 
                ('0' + date.getDate()).slice(-2);

            // Check if the date is in the dateArray
            return dateArray_for_picker1.includes(formattedDate);
        }
    });

    
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
                    console.log("current eye date is " + eye_date)
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
                console.log("Found latest eye date is " + latestdate + "setting picker1 to it")
                $('#datepicker1').datepicker('setDate', new Date(latestdate));
                $('#datepicker1').datepicker('update');
                refresh_calendar2(latestdate)
            }
        });

    })
    .catch(error => console.error('Error fetching CSV file:', error));

        
    
}

function add_listener_to_buttons(){

    // Button click listener
    $('#load_wildfire_to_map').on('click', function() {
        // Get the selected date from the datepicker
        var eyeDate = $('#datepicker1').datepicker('getFormattedDate');
        var selectedDate = $('#datepicker2').datepicker('getFormattedDate');
        console.log("loading layer for "+ selectedDate)
        // Show overlay with selected date
        add_wildfire_predicted_geotiff(eyeDate, selectedDate);
    });

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
    var colors = ['#FFFFFF', '#FFCCCC', '#FF9999', '#FF6666', '#FF3333', 
        '#FF0000', '#CC0000', '#990000', '#660000', '#330000']

    // Specify the number of classes (baskets)
    var numClasses = 10;

    // Generate grades dynamically based on the number of classes
    var grades = Array.from({ length: numClasses + 1 }, function (_, index) {
        return (300 / numClasses) * index;
    });

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
        var grades = Array.from({ length: numClasses + 1 }, function(_, index) {
            return (300 / numClasses) * index;
        });

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

// Automatically load the map when the document is ready
document.addEventListener('DOMContentLoaded', function() {
    loadMap();
    setup_datepicker2()
    setup_datepicker1()
    refresh_calendar()
    add_listener_to_buttons()
    add_legend()
});
