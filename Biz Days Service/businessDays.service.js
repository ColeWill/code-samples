angular.module('jfi')
// System preferences is where I get the start
    .factory('BusinessDays', function ($http, SystemPreferences) {
        const BusinessDays = {};
        // let testDate = null;
        // let validDate = null;

        const incrementDate = (dateToIncrement) => {
            return moment(dateToIncrement, 'MM-DD-YYYY').add(1, 'days');
        }
        const checkDesignatedBusinessDays = (dateIn, bizDayArray) => {
            console.log('checkDesignateBusinessDays Function');
            console.log('date into bizDayCheck:', dateIn.format('MM-DD-YYYY dddd'));
            let checkDay = dateIn.format('dddd').toLowerCase();
            // the businessDay passed in's true/false value
            
            return bizDayArray[checkDay];
        }
        const checkAgainstStaticHoliday = (date, array, holidayValue) => {
            console.log('checkStaticHoliday with:', date.format('MM-DD'));
            let holidayCheck = date.format('MM-DD'); // converts testDate (which is the working date var we receive) to workable format

            for (let i = 0; i < array.length; i++) {
                //          compare the date passed in to the date in the array
                console.log('date to check:', holidayCheck, 'array:', array[i].monthDay,' set to:', holidayValue[array[i].holiday]);
                // console.log('HolidayArray[holidayName]', holidayValue[array[i].holiday]);

                if (holidayCheck === array[i].monthDay) {
                    console.log('INSIDE IF STATMENT');
                    console.log('SaticHoliday MATCH returning TRUE', holidayCheck + " = " + (holidayCheck === array[i].monthDay));
                    // check to see in the desgniatedHoliday array if value is true/false
                    if (holidayValue[array[i].holiday]) {
                        console.log('TRUE SATATIC HOLIDAY RETURN VALUE:', holidayValue[array[i].holiday], array[i].holiday);
                        return holidayValue[array[i].holiday];
                    }
                }
            }
        }
        const checkIsDynamicHoliday = (date, dynamicHolidays) => {
            // Borrowed From Stack Overflow --> I didn't write this logic
            let _holidays = {
                'W': {//Month / Week of Month / Day of Week
                    '1/3/1': "mlkDay",
                    '5/5/1': "memorialDay",
                    '9/1/1': "laborDay",
                    '11/4/4': "thanksgiving",
                    '11/4/5': "blackFriday"
                }
            }; //   returns undefined or 1 of these
            // Borrowed From Stack Overflow --> I didn't write this logic
            let day = new Date(date).getDate();
            let diff = 1 + (0 | (day - 1) / 7);
            let dynamicHolidayResult = _holidays['W'][moment(date).format('M/' + (diff) + '/d')];

            console.log(dynamicHolidayResult, 'is set in Dynamcic Holiday Array to:', dynamicHolidays[dynamicHolidayResult]);

            // the dynamicHoliday in Database is TRUE...
            if (dynamicHolidays[dynamicHolidayResult]) {
                console.log('Dynamic Holiday is TRUE');
                return true; // will result testDate ++
                //UNDEFINED or FALSE = NOT holiday and IS workday
            } else {
                console.log('Dyanmic Holiday is Undefined/False')
                return false; // will result date passing through
            }
        }

        const checkIsEaster = (year, holidayArrValue, tDate) => {
            // check in DB if Easter is true
            console.log('.');
            console.log('XXXX Checking If Easter Function...', year);
            console.log('EASTER SET IN DB TO', holidayArrValue.easter);
            console.log('tDate:', tDate.format('MM-DD-YY'));
            if (holidayArrValue.easter == false ) {
                console.log('EASTER Set to false in DB, not checking date');
                return false;
            }
            
            // Borrowed From Stack Overflow --> I didn't write this logic
            let Y = parseInt(year);
            var C = Math.floor(Y / 100);
            var N = Y - 19 * Math.floor(Y / 19);
            var K = Math.floor((C - 17) / 25);
            var I = C - Math.floor(C / 4) - Math.floor((C - K) / 3) + 19 * N + 15;
            I = I - 30 * Math.floor((I / 30));
            I = I - Math.floor(I / 28) * (1 - Math.floor(I / 28) * Math.floor(29 / (I + 1)) * Math.floor((21 - N) / 11));
            var J = Y + (Math.floor(Y / 4)) + I + 2 - C + (Math.floor(C / 4));
            J = J - 7 * Math.floor(J / 7);
            var L = I - J;
            var M = 3 + Math.floor((L + 40) / 44);
            var D = L + 28 - 31 * Math.floor(M / 4);
             // Borrowed From Stack Overflow --> I didn't write this logic
            
            let display = (number) => {
                return (number < 10) ? '0' + number : number;
            }
            let easterMMDD = display(M) + '-' + display(D);
            
            console.log('EASTER for', Y + ':', easterMMDD, '== testDate:', tDate.format('MM-DD'), 'RETURNS:', easterMMDD == tDate.format('MM-DD'));
            return easterMMDD == tDate.format('MM-DD');
        }

          const checkDatePeriod = (pStart, pEnd, tDate) => {
            
            let checkEndAndStart = moment(pEnd).isSameOrAfter(pStart);
            let checkEnd_Test_Start = (moment(pEnd).isSameOrAfter(tDate) && moment(tDate).isSameOrAfter(pStart));

            if (!checkEndAndStart) { 
                console.log('pEnd > pStart', checkEndAndStart);
                return ;
            } // The EndDate > Start Date && End > Test > Start
            if (checkEndAndStart && checkEnd_Test_Start) {
                console.log('checkDatePeriod is:', checkEnd_Test_Start);
                console.log('888 pEnd > pStart:', checkEndAndStart);
                console.log('pEnd >= tDate && tDate >= pStart:', checkEnd_Test_Start);
                return checkEnd_Test_Start;
            }
        }

        BusinessDays.nextBusinessDay = (startDate, noOfDaysToSkip) => {

            let testDate = moment(startDate, 'MM-DD-YYYY').add(noOfDaysToSkip, 'days');
            let validDate = null;

            return SystemPreferences.getSystemPreferences().then(prefs => {
                let bizDayArray = prefs.data[0].designatedBusinessDays;
                let holidaysArray = prefs.data[0].holidays;
                let dynamicHolidays = prefs.data[0].designatedHoliday;
                let theYear = testDate.format('YYYY');
                let periodStart = moment(prefs.data[0].periodBeginningDate); 
                let periodEnd = moment(prefs.data[0].periodEndingDate);

                let i = 0;
                while (validDate === null && i <= 7) {
                    i++;
                    console.log(i, 'TESTDATE start:', testDate.format('MM-DD-YY dddd'));
                    console.log('.');

                    if (checkDatePeriod(periodStart, periodEnd, testDate) === false) { 
                        return false;
                    }
                    if (checkDesignatedBusinessDays(testDate, bizDayArray)) {
                        console.log(i, 'chekBizDays: if chekBizDay() = true');
                        validDate = testDate; //validDate is updated and passed into next statement
                    }
                    if (validDate === null) { // false = STILL null
                        console.log(i, 'chekBizDays: if validDate === null');
                        // ++ testDate
                        testDate = incrementDate(testDate);
                        console.log('bizDayCheck funct ++ testDate:');
                    }
                    else {
                        console.log(i, 'static holidays if/else');
                        console.log('222 testDate after BIZDAY check:', testDate.format('MM-DD-YYYY dddd')); // returns the day ++ if a holiday or same if not
                        console.log(i,'Static Holiday RETURNING:', checkAgainstStaticHoliday(testDate, holidaysArray, dynamicHolidays));
                        if (checkAgainstStaticHoliday(testDate, holidaysArray, dynamicHolidays)) {
                            // ++ 1 day testDate
                            // validDate = null
                            testDate = incrementDate(testDate);
                            validDate = null;
                            console.log('staticHoliday TRUE testDate ++ :', testDate.format('MM-DD-YYYY dddd'));
                            // STATIC HOLIDAY FALSE
                        } else {
                            console.log(i, 'dynamic holidays if/else');
                            if (checkIsDynamicHoliday(testDate, dynamicHolidays)) {
                                // ++ 1 day testDate
                                // validDate = null
                                testDate = incrementDate(testDate);
                                validDate = null;
                                console.log('dynamicHoliday IF TRUE testDate ++ :', testDate);
                            }    
                            if (checkIsEaster(theYear, dynamicHolidays, testDate)) { 
                                    // ++ 1 day testDate
                                    // validDate = null
                                    testDate = incrementDate(testDate);
                                    validDate = null;
                            } else {
                                validDate = testDate;
                                console.log(i, 'update at end, new VALIDDATE is:', validDate.format('MM-DD-YYYY dddd'));
                            }
                        }
                    }
                } // while (validDate === null){}
                return validDate;

            });  // SystemPreferences.getSystemPreferences()
        };  // BusinessDays.nextBusinessDay(startDate, noOfDaysToSkip)

        BusinessDays.isABusinessDay = (dateToCheck) => {

            let testDate = moment(dateToCheck, 'MM-DD-YYYY');
            console.log('11111 isABizDay date passed in:', testDate.format('MM-DD-YYYY dddd'));

            return SystemPreferences.getSystemPreferences().then(prefs => {
                let bizDayArray = prefs.data[0].designatedBusinessDays;
                let holidaysArray = prefs.data[0].holidays;
                let dynamicHolidays = prefs.data[0].designatedHoliday;
                let theYear = testDate.format('YYYY');
                let periodStart = moment(prefs.data[0].periodBeginningDate); 
                let periodEnd = moment(prefs.data[0].periodEndingDate);

                // Check if dateToCheck is a Designated Business Day
                if (checkDatePeriod(periodStart, periodEnd, testDate) === false) { 
                    return false;
                }
                if (checkDesignatedBusinessDays(testDate, bizDayArray) === false) {
                    console.log('NOT a desBizDay RETURNING FALSE');
                    return false;
                } else {
                    // see if static holiday
                    console.log('checking if static holiday');
                    // if TRUE
                    if (checkAgainstStaticHoliday(testDate, holidaysArray, dynamicHolidays)) {
                        console.log('Static Holiday TRUE, returning FALSE');
                        return false;
                    } else {
                        // return if dateToCheck is not a dynamic holiday
                        if (checkIsDynamicHoliday(testDate, dynamicHolidays)) {
                            console.log('dynamic holiday is TRUE, WORKDAY = FALSE');
                            return false;
                        }
                        if (checkIsEaster(theYear, dynamicHolidays, testDate)) { 
                            console.log('IF statement EASTER is true');
                            return false;
                        } else {
                            console.log('its a workday');
                            return true;
                        }
                    }
                }

            }); // SystemPreferences.getSystemPreferences()

        }// BusinessDays.isABusinessDay();

        return BusinessDays;
    });