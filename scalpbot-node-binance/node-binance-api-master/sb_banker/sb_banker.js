'use strict';
const binance = require('../node-binance-api.js');
const ipc = require('node-ipc');

var sessionStats = {
  totalTrades: NaN,
  accountStartingValue: NaN,
  accountEndingValue: NaN,
  netValue: 0,
}

ipc.config.id = 'banker';
ipc.config.retry = 1500;

var messages = {
    goodbye: false,
    hello: false
};

ipc.serveNet(
    function(){
        ipc.server.on(
            'app.message',
            function(data,socket){
                ipc.log('got a message from', (data.id), (data.message));
                messages[data.id]=true;
                ipc.server.emit(
                    socket,
                    'app.message',
                    {
                        id      : ipc.config.id,
                        message : data.message+' world!'
                    }
                );

                if(messages.hello && messages.goodbye){
                    ipc.log('got all required events, telling clients to kill connection');
                    ipc.server.broadcast(
                        'kill.connection',
                        {
                            id:ipc.config.id
                        }
                    );

                    messages.hello = false;
                    messages.goodbye = false;
                }
            }
        );
    }
);

ipc.server.start();

(function() {
  sb.updateAccountBalances(function() {

  });

  setTimeout(arguments.callee, 1000);
}());
