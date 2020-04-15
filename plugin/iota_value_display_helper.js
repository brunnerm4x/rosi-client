/*
 * 
 * 		Realtime Online Streaming with IOTA payments
 * 			   		CLIENT
 * 
 * 			IOTA value string convertion helper
 * 
 * 
 * 	Changed 05.04.2020
 * 
 * */
 

const stdSignificant = 4;
const prefixes = ['i', 'ki', 'Mi', 'Gi', 'Ti', 'Pi'];

// prints amount in correct prefix (ki, Mi ...)
// if exact is set to boolean true, every deciaml is displayed
// if exact is set to boolean false, standard deciamal lengh is used
// if exact is set to a number, the amount specified significant signs are used
let printIota = function(amount, exact = false)
{
	amount = parseInt(amount);
	// determine prefix
	let i = 0;
	for(; amount >= Math.pow(1000, i) && i < prefixes.length; i++);
	i > 0 ? i-- : 0 ;
	
	if(exact === true)
		return String(amount / Math.pow(1000, i)) + " " + prefixes[i];
	
	if(exact === false)
		exact = stdSignificant;
	exact = parseInt(exact) + 1;

	let dAmount = String(amount / Math.pow(1000, i));

	if(dAmount.indexOf('.') < 0)
		return dAmount + " " + prefixes[i];
	else if(dAmount.indexOf('.') >= exact)
		exact = dAmount.indexOf('.');
		
	dAmount = dAmount.slice(0, exact);
	
	if(dAmount.indexOf('.') > -1)
		while(dAmount.charAt(dAmount.length - 1) === '0')
			dAmount = dAmount.slice(0, -1);
			
	if(dAmount.charAt(dAmount.length - 1) === '.')
		dAmount = dAmount.slice(0, -1);
			
	return dAmount.slice(0, exact) + " " + prefixes[i];
}


// Scans string or number (then i is assumed) and returns value in i
// throws exception if invalid input provided
// String behind valid prefix + unit is ignored eg. "153.115Miota" is a valid string
let scanIota = function(input, caseSensitive = false)
{
	if(typeof input == "number")
		return parseInt(input);
	
	if(typeof input != "string")
	{
		throw new Error("Wrong Input Type");
		return;
	}
	
	let prefx = prefixes;
	if(!caseSensitive)
	{
		prefx = prefixes.map(p => p.toLowerCase());
		input = input.toLowerCase();
	}
	
	let i = prefx.length - 1;
	for(; i > 0 && input.indexOf(prefx[i]) < 0; i--);
	
	if(input.indexOf(prefx[i]) < 0 && isNaN(input))
	{
		throw new Error("Error parsing Input");
		return;
	}
	
	if(input.indexOf(prefx[i]) > -1)
	{
		input = input.slice(0, input.indexOf(prefx[i]));
	}
	
	return parseInt(Math.round(Number(input) * Math.pow(1000, i)));
}



