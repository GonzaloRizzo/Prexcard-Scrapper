var fs = require('fs');
var casper = require('casper').create({
  waitTimeout:40000,
  viewportSize: {
    width: 1920,
    height: 1080
  }
})

var blockedResourcesMatcher=/^.*\.jpg|.*\.png|.*youtube.*|.*google.*|.*freshdesk.*$/
var configFile = 'config.json'
var config = {}
var lastScrap = Date.now()
var lastBalance = null

// Starts casper
casper.start().then(function(){
  console.log("Started")
})

// Reads config file
if(fs.isReadable(configFile)){
  console.log('Reading config')
  config = JSON.parse(fs.read(configFile))
}

// Parses config file
if(!config.username || !config.password || !config.interval){
  casper.die("Invalid config")

  // Workarround for forcing a synchronous exit.
  // See: https://github.com/casperjs/casperjs/issues/193
  casper.bypass(1)
}


// Blocks unneeded resources
casper.on("resource.requested", function(requestData, networkRequest){
  if (requestData.url.match(blockedResourcesMatcher)) {
    networkRequest.abort();
  }
});

// Logs errors
casper.on("resource.error", function(resourceError){
  // Blocks blocked resource errors
  if (resourceError.errorString != 'Protocol "" is unknown'){
    console.log('Unable to load resource (#' + resourceError.id + ' URL:' + resourceError.url + ')');
    console.log('Error code: ' + resourceError.errorCode + '. Description: ' + resourceError.errorString);
  }
});


// Adds login steps to the casper queue
function queueLogin(){
  casper.thenOpen('https://www.prexcard.com/', function(){
    console.log("Loaded prexcard.com")
  })

  casper.then(function(){
    console.log("Writing credentials")
    casper.fillSelectors('form#formLogin', {
      'input[name="usuario"]': config.username,
      'input[name="password"]': atob(config.password)
    }, false)
  })

  casper.thenClick('#btnIngreso', function () {
    console.log("Logging")
  })
  casper.waitForSelector(".boxSaldo", function(){
    console.log("Logged in")
  })
}


function scrap() {
  // Checks if the user is logged
  if (!this.visible('.boxSaldo')){
    queueLogin()
    casper.then(scrap)
  }else{
    console.log("Scraping")

    // Fetchs the current balance
    var balance = this.evaluate(function(){
      // Defines a function that translates the string into a valid number
      function toNumber(num){
        return Number(num.replace('.','').replace(',', '.'))
      }

      var scraped = $('.boxSaldo .saldo p.monto')

      return {
        'usd' : toNumber(scraped[0].innerText),
        'uyu' : toNumber(scraped[1].innerText)
      }

    })
    if (lastBalance != balance){
      fs.write('cache.json', JSON.stringify(balance, null, 4) + "\n", 'w');
      lastBalance = balance
    }
    console.log("Scraped in "+ (Date.now() - lastScrap)/1000 +"s")
    this.wait(config.interval, function(){
      lastScrap = Date.now()
    })
    this.reload(scrap)
  }
}

casper.then(scrap)
casper.run();
