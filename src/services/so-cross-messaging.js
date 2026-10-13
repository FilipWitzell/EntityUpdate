// SuperOffice Cross Messaging
// This allows us to jump to other pages in our main SuperOffice screen even when app is run from a web panel.

var SuperOffice = SuperOffice || {};
SuperOffice.ClientCrossMessaging = SuperOffice.ClientCrossMessaging || {};

(function (ns) {
  var sendCommand = function (command, soArguments) {
    var message = { command: command, arguments: soArguments };
    parent.postMessage(message, "*");
  };

  ns.refresh = function () {
    sendCommand("refresh");
  };

  ns.executeSoProtocol = function (protocol) {
    sendCommand("soprotocol", protocol);
  };

  ns.openDocument = function (documentId) {
    sendCommand("openDocument", documentId);
  };
})(SuperOffice.ClientCrossMessaging);

// Jump to somewhere in SuperOffice using a soProtcol string.
export function jumpTo(soProtocol) {
  SuperOffice.ClientCrossMessaging.executeSoProtocol(soProtocol);
}

export const refreshSuperOffice = () => {
  SuperOffice.ClientCrossMessaging.refresh();
};

export const openSuperOfficeDocument = (documentId) => {
  SuperOffice.ClientCrossMessaging.openDocument(documentId);
};
