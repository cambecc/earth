jQuery(document).ready(function($){

var height_video = $(window).width();
var height_responsive = (height_video / 1.78011) + 1;
$('.video_slide').css("height",height_responsive);



$(window).resize(function() {

var height_video = $(window).width();
var height_responsive = (height_video / 1.78011) + 1;
$('.video_slide').css("height",height_responsive);

});

});

 
var   window_height = $(window).height(),
      testMobile,
	  loadingError = '<p class="error">The Content cannot be loaded.</p>',
	  nameError = '<div class="alert-message error">Please enter your name.<span class="close" href="#">x</span></div>',
	  emailError = '<div class="alert-message error">Please enter your e-mail address.<span class="close" href="#">x</span></div>',
	  invalidEmailError = '<div class="alert-message error">Please enter a valid e-mail address.<span class="close" href="#">x</span></div>',	  
	  subjectError = '<div class="alert-message error">Please enter the subject.<span class="close" href="#">x</span></div>',
	  messageError = '<div class="alert-message error">Please enter your message.<span class="close" href="#">x</span></div>',	
	  mailSuccess = '<div class="alert-message success">Your message has been sent. Thank you!<span class="close" href="#">x</span></div>', 
	  mailResult = $('#contact .result'),
      current,
	  next, 
	  prev,
	  target, 
	  hash,
	  url,
	  page,
	  title,	  	  	  
	  projectIndex,
	  scrollPostition,
	  projectLength,
	  ajaxLoading = false,
	  wrapperHeight,
	  pageRefresh = true,
	  content =false,
	  loader = $('div#loader'),
	  portfolioGrid = $('div#portfolio-wrap'),
	  projectContainer = $('div#ajax-content-inner'),
	  projectNav = $('#project-navigation ul'),
	  exitProject = $('div#closeProject a'),
	  easing = 'easeOutExpo',
	  folderName ='projects';	
	    
	  $.browser.safari = ($.browser.webkit && !(/chrome/.test(navigator.userAgent.toLowerCase())));	 	

	 
	 if ( !$.browser.safari ) {
		  $('.home-parallax').find('.home-text-wrapper').children('.container').addClass('no-safari');
	 }

$(function() {
  	
	/* ------------------------------------------------------------------------ */
	/* MAILCHIMP SUBSCRIPTION */
	/* ------------------------------------------------------------------------ */
		if ($('#newsletterform').length) {
		  if ($('#newsletterform').attr('data-mailchimp') == 'true') {
			$('#newsletterform').attr('action', 'subscribe-mailchimp.php');
			$('#newsletterform').ajaxForm({ dataType: 'json',
											timeout: 2000,
											success: mailchimpCallback});
		  } else {
			$('#newsletterform').attr('action', 'subscribe.php');
			$('#newsletterform').ajaxForm({ dataType: 'json',
											timeout: 2000,
											success: Callback});
		  }
		  $('#button-newsletter').click(function() { $('#newsletterform').submit(); return false; });
		} 	
  

	  });



	  function Callback(response) {
		if (response.responseStatus == 'err') {
		  if (response.responseMsg == 'ajax') {
			alert('Error - this script can only be invoked via an AJAX call.');
		  } else if (response.responseMsg == 'fileopen') {
			alert('Error opening $emailsFile. Please refer to documentation for help.');
		  } else if (response.responseMsg == 'name') {
			alert('Please enter a valid name.');
		  } else if (response.responseMsg == 'email') {
			alert('Please enter a valid email address.');
		  } else if (response.responseMsg == 'duplicate') {
			alert('You are already subscribed to our newsletter.');
		  } else if (response.responseMsg == 'filewrite') {
			alert('Error writing to $emailsFile. Please refer to documentation for help.');
		  } else {
			alert('Undocumented error. Please refresh the page and try again.');
		  }
		} else if (response.responseStatus == 'ok') {
		  alert('Thank you for subscribing to our newsletter!');
		} else {
		  alert('Undocumented error. Please refresh the page and try again.');
		}
	  }
	  
	  
	  function mailchimpCallback(response) {
		if (response.responseStatus == 'err') {
		  if (response.responseMsg == 'ajax') {
			alert('Error - this script can only be invoked via an AJAX call.');
		  } else if (response.responseMsg == 'name') {
			alert('Please enter a valid name.');
		  } else if (response.responseMsg == 'email') {
			alert('Please enter a valid email address.');
		  } else if (response.responseMsg == 'listid') {
			alert('Invalid MailChimp list name.');
		  } else if (response.responseMsg == 'duplicate') {
			alert('You are already subscribed to our newsletter.');
		  } else {
			alert('Undocumented error (' + response.responseMsg + '). Please refresh the page and try again.');
		  }
		} else if (response.responseStatus == 'ok') {
		  alert('Thank you for subscribing! Please confirm your subscription in the email you\'ll receive shortly.');
		} else {
		  alert('Undocumented error. Please refresh the page and try again.');
		}
	  }
   

	$('.home-slide').each(function(){
	    contentSize = $(this).find('.home-slide-content');  
        contentSize.fitText(1.2);			
	});

	
	 var init = function() {	
		  $('nav').animate({'opacity': '1'}, 400);	   
	  
		  // Function to slabtext the H1 headings
		  function slabTextHeadlines() {
			  $(".home-quote h1").slabText({
				   // Don't slabtext the headers if the viewport is under 479px
				  "viewportBreakpoint":300
			
			
			});
    };
	
 


    $(window).load(function() {
        setTimeout(slabTextHeadlines, 5);
    });
		
	 
/*----------------------------------------------------*/
/* FULLSCREEN IMAGE HEIGHT
/*----------------------------------------------------*/	     
	
	  function fullscreenImgHeight(){

		  $('#home, .background-video').css({height:window_height});
/*		  var headerH = $('nav').outerHeight();
          $("#home").css('marginBottom',-headerH);*/
		  
	  }
		  
	  fullscreenImgHeight();
		  
		  
		  
	  $(window).bind('resize',function() {
	  
		  fullscreenImgHeight();
		  home_parallax();
		 		  
	  });	 
	  
};	


  jQuery(window).load(function(){   
  jQuery(document).ready(function($){     
// cache container
	var container = $('#portfolio-wrap');	
	

	container.isotope({
		animationEngine : 'best-available',
	  	animationOptions: {
	     	duration: 200,
	     	queue: false
	   	},
		layoutMode: 'fitRows'
	});	


	// filter items when filter link is clicked
	$('#filters a').click(function(){
		$('#filters a').removeClass('active');
		$(this).addClass('active');
		var selector = $(this).attr('data-filter');
	  	container.isotope({ filter: selector });
        setProjects();		
	  	return false;
	});
		
		
		function splitColumns() { 
			var winWidth = $(window).width(), 
				columnNumb = 1;
			
			
			if (winWidth > 1200) {
				columnNumb = 5;
			} else if (winWidth > 900) {
				columnNumb = 4;
			} else if (winWidth > 600) {
				columnNumb = 3;
			} else if (winWidth > 300) {
				columnNumb = 1;
			}
			
			return columnNumb;
		}		
		
		function setColumns() { 
			var winWidth = $(window).width(), 
				columnNumb = splitColumns(), 
				postWidth = Math.floor(winWidth / columnNumb);
			
			container.find('.portfolio-item').each(function () { 
				$(this).css( { 
					width : postWidth + 'px' 
				});
			});
		}		
		
		function setProjects() { 
			setColumns();
			container.isotope('reLayout');
		}		
		
		container.imagesLoaded(function () { 
			setColumns();
		});
		
	
		$(window).bind('resize', function () { 
			setProjects();			
		});

});
});



function home_parallax() {
	        $(window).scroll(function() {
	            var yPos = -($(window).scrollTop() / 2); 
         
	            // Put together our final background position
	            var coords = '50% '+ yPos + 'px';
	 
	            // Move the background
	            //$('.page-title-wrapper').css({ backgroundPosition: coords });
	            $('.home-parallax, .home-parallax2, .home-parallax3, .home-parallax4').css({ backgroundPosition: coords });
	        
	        }); 
}

 home_parallax();


/*----------------------------------------------------*/
/* MOBILE DETECT FUNCTION
/*----------------------------------------------------*/

	var isMobile = {
        Android: function() {
            return navigator.userAgent.match(/Android/i);
        },
        BlackBerry: function() {
            return navigator.userAgent.match(/BlackBerry/i);
        },
        iOS: function() {
            return navigator.userAgent.match(/iPhone|iPad|iPod/i);
        },
        Opera: function() {
            return navigator.userAgent.match(/Opera Mini/i);
        },
        Windows: function() {
            return navigator.userAgent.match(/IEMobile/i);
        },
        any: function() {
            return (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Opera() || isMobile.Windows());
        }
    };	  
	  
	 	   



	 
/*----------------------------------------------------*/
// CONTACT FORM WIDGET
/*----------------------------------------------------*/

    $("#contact form").submit(function()
    {
        var form = $(this);
        var formParams = form.serialize();
        $.ajax(
        {
            url: 'contact.php',
            type: 'POST',
            traditional: true,
            data: formParams,
            success: function(data){
                var response = jQuery.parseJSON(data);				
                if(response.success)
                {   $('#contact form').slideUp().height('0');
                    $('#contact .result').append(mailSuccess);
                }
                else
                {
				   for(i=0; i<response.errors.length; i++){
					 if(response.errors[i].error == 'empty_name')  {                          
					   mailResult.append(nameError);
					 }
					 if(response.errors[i].error == 'empty_email')  {                          
					   mailResult.append(emailError);
					 }
					 if(response.errors[i].error == 'empty_subject')  {                          
					   mailResult.append(subjectError);
					 }
					 if(response.errors[i].error == 'empty_message')  {                          
					   mailResult.append(messageError);
					 }
					 if(response.errors[i].error == 'invalid'){
						mailResult.append(invalidEmailError);
					 }
				   }
                }
            }
        })
        return false;
    });
	

  

/*----------------------------------------------------*/
// LOAD PROJECT
/*----------------------------------------------------*/ 


	  
function initializePortfolio() {


  $(window).bind( 'hashchange', function() {
	  
	  		 
 hash = $(window.location).attr('hash'); 
 var root = '#!'+ folderName +'/';
 var rootLength = root.length;	
 
 	 
	if( hash.substr(0,rootLength) != root ){
		return;						
	} else {	

		 var correction = 50;
		 var headerH = $('nav').outerHeight()+correction;
		 hash = $(window.location).attr('hash'); 
	     url = hash.replace(/[#\!]/g, '' ); 
		 
		 
       
		portfolioGrid.find('div.portfolio-item.current').children().removeClass('active');
		portfolioGrid.find('div.portfolio-item.current').removeClass('current' );
		
		


		/* IF URL IS PASTED IN ADDRESS BAR AND REFRESHED */
		if(pageRefresh == true && hash.substr(0,rootLength) ==  root){	

				$('html,body').stop().animate({scrollTop: (projectContainer.offset().top-20)+'px'},800,'easeOutExpo', function(){											
					loadProject();																									  
				});
				
		/* CLICKING ON PORTFOLIO GRID OR THROUGH PROJECT NAVIGATION */
		}else if(pageRefresh == false && hash.substr(0,rootLength) == root){				
					$('html,body').stop().animate({scrollTop: (projectContainer.offset().top-headerH)+'px'},800,'easeOutExpo', function(){ 		
		
					if(content == false){						
						loadProject();							
					}else{	
						projectContainer.animate({opacity:0,height:wrapperHeight},function(){
						loadProject();
						});
					}
							
					projectNav.fadeOut('100');
					exitProject.fadeOut('100');
							
					});
			
		/* USING BROWSER BACK BUTTON WITHOUT REFRESHING */	
		}else if(hash=='' && pageRefresh == false || hash.substr(0,rootLength) != root && pageRefresh == false || hash.substr(0,rootLength) != root && pageRefresh == true){	
		        scrollPostition = hash; 
				$('html,body').stop().animate({scrollTop: scrollPostition+'px'},1000,function(){				
							
					deleteProject();								
							
				});
				
		/* USING BROWSER BACK BUTTON WITHOUT REFRESHING */	
		}
		
		
		
		/* ADD ACTIVE CLASS TO CURRENTLY CLICKED PROJECT */
		 portfolioGrid.find('div.portfolio-item .portfolio a[href="#!' + url + '"]' ).parent().parent().addClass( 'current' );
		 portfolioGrid.find('div.portfolio-item.current').find('.portfolio').addClass('active');
		

	
  }
	  
	});	  
	  	/* LOAD PROJECT */		
		function loadProject(){
			loader.fadeIn().removeClass('projectError').html('');
			
			
			if(!ajaxLoading) {				
	            ajaxLoading = true;
								
				projectContainer.load( url +' div#ajaxpage', function(xhr, statusText, request){
																   
						if(statusText == "success"){				
								
								ajaxLoading = false;
								
									page =  $('div#ajaxpage');		
			
									$('.flexslider').flexslider({
												
												animation: "fade",
												slideDirection: "horizontal",
												slideshow: true,
												slideshowSpeed: 3500,
												animationDuration: 500,
												directionNav: true,
												controlNav: true
												
										});
			
									jQuery('#ajaxpage').waitForImages(function() {
										hideLoader();  
									});				  
											
										$(".container").fitVids();	
								
						}
						
						if(statusText == "error"){
						
								loader.addClass('projectError').append(loadingError);
								
								loader.find('p').slideDown();

						}
					 
					});
				
			}
			
		}
		

		
		function hideLoader(){
			loader.fadeOut('fast', function(){													  
					showProject();					
			});			 
		}	
		
		
		function showProject(){
			if(content==false){
				    wrapperHeight = projectContainer.children('div#ajaxpage').outerHeight()+'px';
					projectContainer.animate({opacity:1,height:wrapperHeight}, function(){
				        $(".container").fitVids();
						scrollPostition = $('html,body').scrollTop();
						projectNav.fadeIn();
						exitProject.fadeIn();
						content = true;	
								
					});
					
			}else{
                    wrapperHeight = projectContainer.children('div#ajaxpage').outerHeight()+'px';
					projectContainer.animate({opacity:1,height:wrapperHeight}, function(){																		  
					$(".container").fitVids();
						scrollPostition = $('html,body').scrollTop();
						projectNav.fadeIn();
						exitProject.fadeIn();
						
					});					
			}
					
			
			projectIndex = portfolioGrid.find('div.portfolio-item.current').index();
			projectLength = $('div.portfolio-item .portfolio').length-1;
			
			
			if(projectIndex == projectLength){
				
				$('ul li#nextProject a').addClass('disabled');
				$('ul li#prevProject a').removeClass('disabled');
				
			}else if(projectIndex == 0){
				
				$('ul li#prevProject a').addClass('disabled');
				$('ul li#nextProject a').removeClass('disabled');
				
			}else{
				
				$('ul li#nextProject a,ul li#prevProject a').removeClass('disabled');
				
			}
		
	  }
	  
	  
	  
	  function deleteProject(closeURL){
				projectNav.fadeOut(100);
				exitProject.fadeOut(100);				
				projectContainer.animate({opacity:0,height:'0px'});
				projectContainer.empty();
				
			if(typeof closeURL!='undefined' && closeURL!='') {
				location = '#_';
			}
			portfolioGrid.find('div.portfolio-item.current').children().removeClass('active');
			portfolioGrid.find('div.portfolio-item.current').removeClass('current' );			
	  }
	  
	  
     /* LINKING TO PREIOUS AND NEXT PROJECT VIA PROJECT NAVIGATION */
	  $('#nextProject a').on('click',function () {											   							   
					 
		    current = portfolioGrid.find('.portfolio-item.current');
		    next = current.next('.portfolio-item');
		    target = $(next).children('div').children('a').attr('href');
			$(this).attr('href', target);
			
		
			if (next.length === 0) { 
				 return false;			  
			 } 
		   
		   current.removeClass('current'); 
		   current.children().removeClass('active');
		   next.addClass('current');
		   next.children().addClass('active');
		   
		  
		   
		});



	    $('#prevProject a').on('click',function () {			
			
		  current = portfolioGrid.find('.portfolio-item.current');
		  prev = current.prev('.portfolio-item');
		  target = $(prev).children('div').children('a').attr('href');
		  $(this).attr('href', target);
			
		   
		   if (prev.length === 0) {
			  return false;			
		   }
		   
		   current.removeClass('current');  
		   current.children().removeClass('active');
		   prev.addClass('current');
		   prev.children().addClass('active');
		   
		});
		
		
         /* CLOSE PROJECT */
		 $('#closeProject a').on('click',function () {
			 
		    deleteProject($(this).attr('href')); 			
			portfolioGrid.find('div.portfolio-item.current').children().removeClass('active');			
			loader.fadeOut();
			return false;
			
		});
		 

		 
		 pageRefresh = false;	  


};

		 

	
//BEGIN DOCUMENT.READY FUNCTION
$(document).ready(function() 
{ 
  init(); 
  initializePortfolio();  
  rnr_shortcodes();
   

/* ------------------------------------------------------------------------ */
/* BACK TO TOP 
/* ------------------------------------------------------------------------ */

	$(window).scroll(function(){
		if($(window).scrollTop() > 200){
			$("#back-to-top").fadeIn(200);
		} else{
			$("#back-to-top").fadeOut(200);
		}
	});
	
	$('#back-to-top, .back-to-top').click(function() {
		  $('html, body').animate({ scrollTop:0 }, '800');
		  return false;
	});
		
      

/*----------------------------------------------------*/
// ADD PRETTYPHOTO
/*----------------------------------------------------*/
	$("a[data-rel^='prettyPhoto']").prettyPhoto();
	
	
/*----------------------------------------------------*/
// ADD VIDEOS TO FIT ANY SCREEN
/*----------------------------------------------------*/
	 $(".container").fitVids();	 		
					
  
/*----------------------------------------------------*/
// PRELOADER CALLING
/*----------------------------------------------------*/    
    $("body.onepage").queryLoader2({
        barColor: "#111111",
        backgroundColor: "#ffffff",
        percentage: true,
        barHeight: 3,
        completeAnimation: "fade",
        minimumTime: 200
    });  
	


	
/*----------------------------------------------------*/
// MENU SMOOTH SCROLLING
/*----------------------------------------------------*/  
    $(".main-menu a, .logo a, .home-logo-text a, .home-logo a, .scroll-to").bind('click',function(event){
		
		$(".main-menu a").removeClass('active');
		$(this).addClass('active');			
		var headerH = $('.navigation').outerHeight();
	
        $("html, body").animate({
            scrollTop: $($(this).attr("href")).offset().top - headerH + 'px'
        }, {
            duration: 1200,
            easing: "easeInOutExpo"
        });

		event.preventDefault();
    });	
	
	  
/*----------------------------------------------------*/
// PARALLAX CALLING
/*----------------------------------------------------*/  

	$(window).bind('load', function () {
		parallaxInit();						  
	});

	function parallaxInit() {
		testMobile = isMobile.any();
		
		if (testMobile == null)
		{
			$('.parallax .bg1').parallax("50%", 0.6);
			$('.parallax .bg2').parallax("50%", 0.6);
			$('.parallax .bg3').parallax("50%", 0.6);	
			$('.parallax .bg4').parallax("50%", 0.6);				
		} 
	}

	
	jQuery('.milestone-counter').appear(function() {
		$('.milestone-counter').each(function(){
			dataperc = $(this).attr('data-perc'),
			$(this).find('.milestone-count').delay(6000).countTo({
            from: 0,
            to: dataperc,
            speed: 2000,
            refreshInterval: 100
        });
     });
 });	
	parallaxInit();	 
 
    //img overlays
    $('.team-thumb').on('mouseover', function()
    {
        var overlay = $(this).find('.team-overlay');
        var content = $(this).find('.overlay-content');

        overlay.stop(true,true).fadeIn(600);
        content.stop().animate({'top': "40%",
			                     opacity:1 }, 600);
        
    }).on('mouseleave', function()
    {
        var overlay = $(this).find('.team-overlay');
        var content = $(this).find('.overlay-content');
        
        content.stop().animate({'top': "60%",
			                     opacity:0  }, 300, function(){
			content.css('top',"20%")});
			
        overlay.fadeOut(300);
		
    }); 	
  
});
//END DOCUMENT.READY FUNCTION
			


// BEGIN WINDOW.LOAD FUNCTION		
$(window).load(function(){
	
	$('#load').fadeOut().remove();
	$(window).trigger( 'hashchange' );
	$(window).trigger( 'resize' );
  $('[data-spy="scroll"]').each(function () {
    var $spy = $(this).scrollspy('refresh');
	
  }); 	
 
/* ------------------------------------------------------------------------ */
/* FLEX SLIDER */
/* ------------------------------------------------------------------------ */    

	 if ( $.browser.safari ) {
		  $('.flexslider').flexslider({						
			animation: "slide",
			direction: "horizontal", 
			slideshow: false,
			slideshowSpeed: 3500,
			animationDuration: 500,
			directionNav: true,
			controlNav: false,						
			useCSS: false
		  });
	 }
	$('.flexslider').flexslider({						
			animation: "slide",
			direction: "horizontal", 
			slideshow: false,
			slideshowSpeed: 3500,
			animationDuration: 500,
			directionNav: true,
			controlNav: false
				
	 });
	 
/* ------------------------------------------------------------------------ */
/* Skillbar */
/* ------------------------------------------------------------------------ */	
	jQuery('.skillbar').appear(function() {
		$('.skillbar').each(function(){
			dataperc = $(this).attr('data-perc'),
			$(this).find('.skill-percentage').animate({ "width" : dataperc + "%"}, dataperc*10);
		});
	 });  
 
/* ------------------------------------------------------------------------ */
/* TEXT FITTING FOR HOME STYLING 2 */
/* ------------------------------------------------------------------------ */ 	    
     $('.home-slide-content').fitText(1.2);
	  $('.fittext-content').fitText(2);
 
/* ------------------------------------------------------------------------ */
/* STICKY NAVIGATION */
/* ------------------------------------------------------------------------ */ 
 
	$("nav.sticky-nav").sticky({ topSpacing: 0, className: 'sticky', wrapperClassName: 'main-menu-wrapper' });
	

	if ($(window).scrollTop() > $(window).height()){
		$('nav.transparent').addClass('scroll');		
	} else {
		$('nav.transparent').removeClass('scroll');				
	}	
	
	$(window).on("scroll", function(){
		var winHeight = $(window).height();
		var windowWidth = $(window).width();
		var windowScroll = $(window).scrollTop();
		var home_height =  $('#home').outerHeight();

			if ($(window).scrollTop() > home_height){
				$('nav.transparent').addClass('scroll');										
			} else {
				$('nav.transparent').removeClass('scroll');									
			}

		
	  });

/* ------------------------------------------------------------------------ */
/* SELECTNAV - A DROPDOWN NAVIGATION FOR SMALL SCREENS */
/* ------------------------------------------------------------------------ */ 
	selectnav('nav', {
		nested: true,
		indent: '-'
	}); 
	
	
 
});
// END OF WINDOW.LOAD FUNCTION
	
  
 $('#home-slider.flexslider').flexslider({						
		animation: "swing",
		direction: "vertical", 
		slideshow: true,
		slideshowSpeed: 3500,
		animationDuration: 1000,
		directionNav: false,
		controlNav: true,
		smootheHeight:true,
		after: function(slider) {
		  slider.removeClass('loading');
		}
			
 });
 

 
 
 (function($) {
    $.fn.countTo = function(options) {
        // merge the default plugin settings with the custom options
        options = $.extend({}, $.fn.countTo.defaults, options || {});

        // how many times to update the value, and how much to increment the value on each update
        var loops = Math.ceil(options.speed / options.refreshInterval),
            increment = (options.to - options.from) / loops;

        return $(this).delay(1000).each(function() {
            var _this = this,
                loopCount = 0,
                value = options.from,
                interval = setInterval(updateTimer, options.refreshInterval);

            function updateTimer() {
                value += increment;
                loopCount++;
                $(_this).html(value.toFixed(options.decimals));

                if (typeof(options.onUpdate) == 'function') {
                    options.onUpdate.call(_this, value);
                }

                if (loopCount >= loops) {
                    clearInterval(interval);
                    value = options.to;

                    if (typeof(options.onComplete) == 'function') {
                        options.onComplete.call(_this, value);
                    }
                }
            }
        });
    };

    $.fn.countTo.defaults = {
        from: 0,  // the number the element should start at
        to: 100,  // the number the element should end at
        speed: 1000,  // how long it should take to count between the target numbers
        refreshInterval: 100,  // how often the element should be updated
        decimals: 0,  // the number of decimal places to show
        onUpdate: null,  // callback method for every time the element is updated,
        onComplete: null,  // callback method for when the element finishes updating
    };
})(jQuery);


	 
