
//Select html value, api, json, pass to next function   
function getWeather(){
    // Select and get Html value. Get main API key. Get API url (html value)
    const apiKey = "604e09ad8edad6d7d1cb8c97b323beba";
    const city = document.getElementById("city").value;
    const currentWeatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}`;

    //Get API output. Convert to Json. Pass to displayWeather function
    fetch(currentWeatherUrl)
        .then(respond => respond.json() )
        .then(data => { displayWeather(data); })  
        .catch(error => {
            console.error ("there is fetching error - not shown",error);
            alert("there is fetching error. pls try again - shown to users");
        })
}


//Select html to be displayed. Continure to handle json. Connect api to FE
function displayWeather(data){
    //select html to be displayed
    const tempDivInfo = document.getElementById("temp-div");
    const weatherInfoDiv = document.getElementById("weather-info");

    // Handle API output under json format. convert json value to variables
    if(data.cod === '404'){
        weatherInfoDiv.innerHTML = `<p>${data.message}<p>`;
    } else{ 
  
    const temperature = Math.round(data.main.temp - 273.5); //kelvin to c
    const description = data.weather[0].description;

     
     //format & group variables
     const temperatureHtml = `
        <p>the temperature is ${temperature}</p>
    `;

     const descriptionHtml = `
   
        <p>the weather description is ${description}</p>
    `;
    
    //print on FE by connect "variables" & " select html to be displayed"

    tempDivInfo.innerHTML = temperatureHtml;
    weatherInfoDiv.innerHTML = descriptionHtml; 
    }
}

  