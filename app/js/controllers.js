'use strict';

var snapscripApp = angular.module('snapscripApp_controllers', ['ui.router', 'snapscripApp_services']);

snapscripApp.config(function($stateProvider, $urlRouterProvider) {
  $stateProvider
      .state('home', {
        url: '/home',
        templateUrl: 'templates/home.html',
        controller: 'ScripController'
      })
      .state('root', {
        url: '/',
        templateUrl: 'templates/home.html',
        controller: 'ScripController'
      })
      .state('selectedCard', {
        url: '/cards/:cardName',
        templateUrl: 'templates/cardDetail.html',
        resolve: {
          CardService: 'CardService',
          CartService: 'CartService',
          LocationService: 'LocationService',
          cardLookup: function(CardService, $stateParams) {
            return CardService.findCard($stateParams.cardName);
          }
        },
        controller: function($scope, $stateParams, cardLookup, CartService, LocationService) {
          cardLookup.promise.then(function(data){$scope.card = data});
          $scope.addToCart = CartService.addItemToCart;
          $scope.cardCount = CartService.cardCount;
          $scope.clearCards = CartService.clearCards;
          $scope.viewCart = LocationService.cart;
          $scope.removeItemFromCart = CartService.removeItemFromCart;
          $scope.clearCardsForAllValues = function() {
            _.forEach($scope.card.values, function(value) {
              $scope.clearCards($scope.card.name, parseInt(value));
            });
          }
        }
      })
      .state('cart', {
        url: '/cart',
        templateUrl: 'templates/cart.html',
        controller: 'CartController'
      })
      .state('order', {
        url: '/order',
        templateUrl: 'templates/orderOptions.html',
        resolve: {
          CartService: 'CartService'
        },
        controller: function($scope, CartService) {
          $scope.addTransactionFee = CartService.addTransactionFee;
 	  $scope.transactionFee = CartService.transactionFee;
        }
      })
      .state('review', {
        url: '/review',
        templateUrl: 'templates/review.html',
        resolve: {
          CartService: 'CartService',
          PdfService: 'PdfService',
          OrderService: 'OrderService',
          LocationService: 'LocationService'
        },
        controller: 'ReviewController'
      })
      .state('billing', {
	url: '/billing',
	templateUrl: 'templates/billing.html',
	resolve: {
	  CartService: 'CartService',
	  LocationService: 'LocationService'
	},
	controller: function($scope, CartService, LocationService, $http) {
	  $scope.totalCartAmount = CartService.totalCartAmount;
	  $scope.person = {};
	  $scope.placeOrder = function() {
	    $scope.person.totalAmount = CartService.totalCartAmount();
	    $scope.person.items = CartService.allCartItems();
	    $http.post('/cashorders', $scope.person).success(function(completedOrder) {
 	      CartService.clearCart();
 	      LocationService.confirmation(); 
	    }).error(function(data) {
		alert('The website is having some difficulties right now.  Please try again later or email snapscrip@gmail.com')
	    }) 
	  }
	}
      })
      .state('confirmation', {
        url: '/confirmation',
        templateUrl: 'templates/confirmation.html',
        resolve: {
          CartService: 'CartService',
          OrderService: 'OrderService',
          PdfService: 'PdfService'
        },
        controller: function($scope, CartService, OrderService, PdfService) {
          $scope.allCartItems = CartService.allCartItems;
          $scope.confirmOrder = OrderService.confirmOrder;
          $scope.currentOrder = OrderService.currentOrder;
          $scope.getPdf = PdfService.getPdf;

//          $scope.order = {
//            orderId:'meganmenne-1234',
//            orderInformation:{firstName:'Megan', lastName:'Menne', phoneNumber:'314 477 1111', rectoryPickup:1, afterMass:1, sendHome:1, childName:'Laura', homeroom:'3rd', checkNumber:1001, checkAmount:100 },
//            orders:[{'name':'Amazon', 'value':50}, {'name':'Amazon', 'value':50}]}
          $scope.order = OrderService.completedOrder();
          $scope.confirmationNumber = $scope.order.id;
//          PdfService.getPdf($scope.order).promise.then(function(pdf) {
//            //pdf.save('1234');
//            var pdfSource = pdf.output('datauristring');
//            angular.element('#pdfViewer').append("<iframe frameborder='0' src='" + pdfSource + "' width='650' height='450'></iframe>")
//            $scope.pdfSource = pdfSource;
//          });
          $scope.downloadCurrent = function() {
            PdfService.getPdf($scope.order).promise.then(function(pdf) {
              pdf.save($scope.confirmationNumber);
            });
          }
        }
      })
});

snapscripApp.controller('CartController', function($scope, CartService, LocationService, socket) {
  var cartCtrl = this;
  $scope.totalDollarsRaised = 0;
  $scope.itemsInCart = CartService.allCartItems();


  $scope.removeItem = function(card) {
    CartService.removeItemFromCart(card);
  };

  $scope.showCart = function() {
    LocationService.cart();
  };

  socket.on('update total', function(data) {
    $scope.totalDollarsRaised = data * 100;
  });

});

snapscripApp.controller('ReviewController', function($scope, PdfService, CartService, OrderService, LocationService, $http, socket, $location) {
    var reviewCtrl = this;
    var processing = false;
    $scope.generatePdf = PdfService.getPdf;
    $scope.allCartItems = CartService.allCartItems;
    $scope.addTransactionFee = CartService.addTransactionFee;
    $scope.fees = function(cartItem) {
      return !cartItem.percentage;
    }
    $scope.giftCards = function(cartItem) {
      return cartItem.percentage;
    }

    $scope.processPayment = function() {
      console.log('Processing');
      var token = function(res) {
        res.order = {'items':$scope.allCartItems(), 'totalCharge':CartService.totalCartAmount() * 100};
        $http.post('/orders', res).success(function(completedOrder) {
          OrderService.save(completedOrder);
          CartService.clearCart();
          LocationService.confirmation();
          socket.emit('new purchase', CartService.totalCartAmount() * 100);
        }).error(function(data) {
            if (data.indexOf("502") > -1) { alert ('Looks like our servers are taking a little break. \n  No payment was processed.  \n\n Please check back really soon or send us a note at snapscrip@gmail.com'); return; }
            alert('Error processing the credit card payment.  \n Please contact snapscrip@gmail.com');
        });
      };


      console.log('processing order for ' + CartService.totalCartAmount());
      if (CartService.hasTransactionFee()) {
        StripeCheckout.open({
          key:         'pk_test_tN69u31YtFcON5Mil68f3YwA',
          address:     true,
          amount:      CartService.totalCartAmount() * 100,
          currency:    'usd',
          name:        'Snap Scrip',
          description: 'St. Joan of Arc Grade School Scrip',
          panelLabel:  'Checkout',
          token:       token
        });
      } else {
	$location.path('/billing');
      }
    }
});

snapscripApp.controller('CardController', function($scope, CardService) {
  $scope.card = {};
});

snapscripApp.controller('ScripController', function($scope, $location, CardService, CartService) {
  var scripCtrl = this;
  scripCtrl.giftcards = [];
  scripCtrl.searchCriteria = "";
  scripCtrl.schoolName = 'St. Joan of Arc';

  scripCtrl.viewCard = function(giftcard) {
    console.log(giftcard.key);
    $location.path("/cards/" + giftcard.key);
  };

  scripCtrl.allCards = function() {
    return CardService.allCards();
  };
  scripCtrl.addToCart = function(giftCard, value) {
    CartService.addItemToCard(giftCard, value);
  };

  $scope.currentFilter = ""
  $scope.cssquery = function() {
    return "[id^='" + $scope.searchCriteria + "']" + ",[tags*='" + $scope.searchCriteria + "']";
  }

  $scope.clearSearch = function(filter) {
    $scope.searchCriteria = "";
    $scope.currentFilter = filter;
  }

  $scope.$watch('searchCriteria', function() {
    if ($scope.searchCriteria) {
      $('#tempButton').remove();
      $('.ui.buttons').append('<button id="tempButton" class="hideit ui button categoryButton" ok-sel="' + $scope.cssquery() + '" ng-click="clearSearch()">Search</button>')
      $('#tempButton').click();
      $scope.$emit('iso-method', {name:null, params:null})
    } else {
      $('#allfilter').click();
    }
  });

});

snapscripApp.controller('BaseController', function($scope, LocationService, $location) {
  var baseCtrl = this;
  baseCtrl.$location = $location;
  baseCtrl.cartItems = ['a', 'b'];
  baseCtrl.viewCart = LocationService.cart;
  baseCtrl.viewHome = LocationService.home;
});


snapscripApp.filter('valueAggregate', function() {
  return function(itemsWithValue) {
    return _.reduce(itemsWithValue, function(total, nextItem) {
      total += parseFloat(nextItem.value);
      return total;
    }, 0);
  }
});
snapscripApp.filter('totalAggregate', function() {
  return function(itemsWithValue) {
    return _.reduce(itemsWithValue, function(total, nextItem) {
      total += parseFloat(nextItem.total);
      return total;
    }, 0);
  }
});
snapscripApp.filter('countAggregate', function() {
  return function(items) {
    return _.size(items);
  }
});
snapscripApp.filter('cardCountAggregate', function() {
  return function(items) {
    var count = 0;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type === 'fee') { continue; }
      count++;
    }
    return count;
  }
});snapscripApp.filter('donationAggregate', function() {
  return function(itemsWithValue) {
    return parseFloat(_.reduce(itemsWithValue, function(total, nextItem) {
      total += (parseInt(nextItem.value)  * (nextItem.percentage / 100));
      return total;
    }, 0)).toFixed(2);
  }
});
snapscripApp.filter('orderAggregate', function() {
  return function(orders) {
    var totals = [];
    var cardGroups = _.groupBy(orders, "key");
    for (var cardKey in cardGroups) {
      var count = 0;
      var totalValue = 0;
      for (var i = 0; i < orders.length; i++) {
        if (orders[i].key === cardKey) {
          count++;
          totalValue = totalValue + orders[i].value;
        }
      }
      if (count) {
        totals.push({key:cardKey, total:totalValue, count:count});
      }
    }
    return totals;
  }
});
snapscripApp.filter('isStockedFilter', function($http) {
  var stockedGiftcards = [];
  $http.get('/rest/form.json').success(function(cardConfigs) {
    for (var i = 0; i < cardConfigs[0].pages[0].fields.length; i++) {
      if (cardConfigs[0].pages[0].fields[i].instock) {
        stockedGiftcards.push(cardConfigs[0].pages[0].fields[i]);
      }
    }
    for (var i = 0; i < cardConfigs[0].pages[1].fields.length; i++) {
      if (cardConfigs[0].pages[1].fields[i].instock) {
        stockedGiftcards.push(cardConfigs[0].pages[1].fields[i]);
      }
    }
  })
  return function(key) {
    if (stockedGiftcards.length == 0) { return false; }
    for (var i = 0; i < stockedGiftcards.length; i++) {
      if (stockedGiftcards[i].key === key) {
        return true;
      }
    }
    return false;
  }
});
snapscripApp.filter('cardName', function() {
  return function(imagePath) {
    return imagePath.split('/')[1].split('.')[0].split('-')[0];
  }
});

snapscripApp.directive('gcard', function($location) {

  var imgElement = angular.element("<img ng-class='imgClass' id='{{giftcard.key}}' ng-mouseover='hoverGiftCard()' ng-mouseleave='exitGiftCard()' ng-click='viewCard()' data-content='This is where you buy buy buy' src='{{giftcard.path}}'>");
  var textElement = angular.element("<h2 ng-class='textClass' id='{{giftcard.key}}' ng-mouseover='hoverGiftCard()' ng-mouseleave='exitGiftCard()' ng-click='viewCard()'>{{giftcard.percentage}}%</h2>");
  var instructionsElement = angular.element("<p ng-class='instructionClass' ng-mouseover='hoverGiftCard()' ng-mouseleave='exitGiftCard()' ng-click='viewCard()'>Click to Buy</p>");

  var link = function(scope, element) {
    scope.imgClass = 'ui small image';
    scope.textClass = 'imageHide';
    scope.instructionClass = 'imageHide';

    scope.hoverGiftCard = function() {
      scope.imgClass = "ui small disabled image";
      scope.textClass = 'imageText';
      scope.instructionClass = 'instructionText';
    };
    scope.exitGiftCard = function() {
      scope.imgClass = 'ui small image';
      scope.textClass = 'ui link imageHide';
      scope.instructionClass = 'ui link imageHide';
    };
    scope.viewCard = function() {
      console.log(scope.giftcard.key);
      $location.path("/cards/" + scope.giftcard.key);
    };
  };

  return {
    restrict: 'E',
    replace: true,
//    transclude: true,
    scope: {
      giftcard: '=data'
    },
    templateUrl: 'templates/gcard.html',
    compile: function(tElem) {
      tElem.append(imgElement);
      tElem.append(textElement);
      tElem.append(instructionsElement);
      tElem.append(angular.element("<br>"));

      return link;
    }
  }
});

snapscripApp.directive('imagedouble', function() {
  return function(scope, element) {
    element.bind('mouseenter', function() {

    });
  }
});

snapscripApp.factory('LocationService', function($location) {
  return {
    'home': function() {
      $location.path('/');
    },
    'cart': function() {
      $location.path('/cart');
    },
    'confirmation': function() {
      $location.path('/confirmation');
    }
  }
});

snapscripApp.controller('TestController', function($scope, PdfService, CardService, CartService) {
  var testController = this;

  $scope.pdfSource = 'admin.html';
  $scope.PdfService = PdfService;
  PdfService.testPdfs();

  $scope.generatePdf = function() {

    var giftcards = CardService.allCards();
    _.forEach(giftcards, function(giftcard) {
      CartService.addItemToCart(giftcard, giftcard.values[0]);
    });

    var testOrder = {
      orderInformation: {
        name: 'Megan Menne',
        phoneNumber: '314 304 3148',
        accountNumber: '123455',
        routingNumber: '123423434535',
        checkNumber: 1001,
        checkAmount: 100
      },
      orders: CartService.allCartItems()
    };

    var pdfPromise = PdfService.getPdf(testOrder);
    pdfPromise.promise.then(function(pdf) {
      $scope.pdfSource = pdf.output('datauristring');
      $('iframe').attr('src', $scope.pdfSource);
      console.log($scope.pdfSource);
    });
  }

  $scope.generatePdf();

});
