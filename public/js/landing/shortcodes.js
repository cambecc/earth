function rnr_shortcodes() {
	
		
	/* ------------------------------------------------------------------------ */
	/* Accordion */
	/* ------------------------------------------------------------------------ */
	
	jQuery('.accordion').each(function(){
	    var acc = jQuery(this).attr("rel") * 2;
	    jQuery(this).find('.accordion-inner:nth-child(' + acc + ')').show();
	     jQuery(this).find('.accordion-inner:nth-child(' + acc + ')').prev().addClass("active");
	});
	
	jQuery('.accordion .accordion-title').click(function() {
	    if(jQuery(this).next().is(':hidden')) {
	        jQuery(this).parent().find('.accordion-title').removeClass('active').next().slideUp(200);
	        jQuery(this).toggleClass('active').next().slideDown(200);
	    }
	    return false;
	});
	
	/* ------------------------------------------------------------------------ */
	/* Alert Messages */
	/* ------------------------------------------------------------------------ */
	
	jQuery(".alert-message .close").live('click',function(){
		jQuery(this).parent().animate({'opacity' : '0'}, 300).slideUp(300);
		return false;
	});
	
	/* ------------------------------------------------------------------------ */
	/* Skillbar */
	/* ------------------------------------------------------------------------ */
	
	jQuery('.skillbar').each(function(){
	    dataperc = jQuery(this).attr('data-perc'),
	    jQuery(this).find('.skill-percentage').animate({ "width" : dataperc + "%"}, dataperc*10);
	});
	
	/* ------------------------------------------------------------------------ */
	/* Tabs */
	/* ------------------------------------------------------------------------ */
	
	jQuery('div.tabset').tabset();
	
	/* ------------------------------------------------------------------------ */
	/* Toggle */
	/* ------------------------------------------------------------------------ */
	
	if( jQuery(".toggle .toggle-title").hasClass('active') ){
		jQuery(".toggle .toggle-title.active").closest('.toggle').find('.toggle-inner').show();
	}
	
	jQuery(".toggle .toggle-title").click(function(){
		if( jQuery(this).hasClass('active') ){
			jQuery(this).removeClass("active").closest('.toggle').find('.toggle-inner').slideUp(200);
		}
		else{
			jQuery(this).addClass("active").closest('.toggle').find('.toggle-inner').slideDown(200);
		}
	});

/* EOF document.ready */

};

/* Tabset Function ---------------------------------- */
(function (jQuery) {
jQuery.fn.tabset = function () {
    var jQuerytabsets = jQuery(this);
    jQuerytabsets.each(function (i) {
        var jQuerytabs = jQuery('li.tab a', this);
        jQuerytabs.click(function (e) {
            var jQuerythis = jQuery(this);
                panels = jQuery.map(jQuerytabs, function (val, i) {
                    return jQuery(val).attr('href');
                });
            jQuery(panels.join(',')).hide();
            jQuerytabs.removeClass('selected');
            jQuerythis.addClass('selected').blur();
            jQuery(jQuerythis.attr('href')).show();
            e.preventDefault();
            return false;
        }).first().triggerHandler('click');
    });
};
})(jQuery);

/* ------------------------------------------------------------------------ */
/* EOF */
/* ------------------------------------------------------------------------ */