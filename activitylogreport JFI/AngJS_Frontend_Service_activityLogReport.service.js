angular.module('jfi')

  .factory('ActivityLogReportService', ($http) => {
    const ActivityLogReportService = {};
    let reportCriteria = {};
    let dateReturnObj = {};

    const combineDateAndTime = (beginDate, beginTime, endDate, endTime) => {

      const dateCombiner = (dateIn, inTime) => {
        dateIn = moment(dateIn, 'MM-DD-YYYY HH:MM:SS').startOf('day');
        let timeHH = moment(inTime, "HH").format('HH');
        console.log('timeHH:', timeHH);
        let timeMM = moment(inTime, 'mm').format('mm');
        console.log('timeMM:', timeMM);
        let combo = moment(dateIn).add(timeHH, 'h'); // + hours
        combo = moment(combo).add(timeMM, 'm'); // + min

        console.log('starting with:', dateIn.format('MM-DD-YYYY HH:mm'), 'adding this time:', moment(inTime).format('HH:mm'));
        console.log('RESULTING COMBO:', combo.format('MM-DD-YYYY hh:mm A'));

        return combo;
      }
      if (beginTime == null) {
        dateReturnObj.begin = moment(beginDate).startOf('day');
      } else {
        dateReturnObj.begin = dateCombiner(beginDate, beginTime);
      }

      if (endTime == null) {
        dateReturnObj.end = moment(endDate).endOf('day');
      } else {
        dateReturnObj.end = dateCombiner(endDate, endTime);
      }
      return dateReturnObj;

    } // timeAdjuster function...
    
    ////////////////// GET THE DATA ////////////////////
    ActivityLogReportService.getAll = (inputData) => {

      reportCriteria = inputData;

      let reportDataRequest = {
        "projectTypes": [],
        "beginDate": null,
        "endDate": null,
        "activityIds": []
      };
      let reportTimeAdjuster = {};

      reportTimeAdjuster = combineDateAndTime(
        reportCriteria.beginDate, reportCriteria.beginTime,
        reportCriteria.endDate, reportCriteria.endTime
      );


      reportDataRequest.beginDate = reportTimeAdjuster.begin._d;
      reportDataRequest.endDate = reportTimeAdjuster.end._d

      // PROJECT TYPES are pushed to request body
      reportCriteria.projectTypes.forEach((pType) => {
        // if the project type is selescted and it is NOT present in the array

        if (pType.selected && (reportDataRequest.projectTypes.indexOf(pType.type) < 0)) {

          reportDataRequest.projectTypes.push(pType.type);
        }
      });
      // Activity Ids are pushed to request Body
      reportCriteria.activityLogTypes.forEach((actType) => {
        if (actType.selected) {
          reportDataRequest.activityIds.push(actType._id);
        }
      });

      // No activites selected --> passing ALL back
      if (reportDataRequest.activityIds.length === 0) {
        reportCriteria.activityLogTypes.forEach((actType) => {
          reportDataRequest.activityIds.push(actType._id);
        });
        console.log('PASSING ALL IDS BACK:', reportDataRequest.activityIds.length);
      }

      console.log("Sorted Data REQUEST:", reportDataRequest);

      return $http.post('/ap1/v1/projects/activityLogReport/', reportDataRequest)
        .success((activityLogs) => {
          reportDataRequest = {};
          return activityLogs;
        })
        .error((err) => {
          return console.log('Error retrieving report data: ', err);
        })
    }; // Get Request

    // function for export Codes
    const buildExportCode = (activityLog) => {
      let dateCode = moment(activityLog.activityDate).format('YYYYMMDD');
      let time = moment(activityLog.activityDate).format('HH:mm');
      let exportLetterCode = (activityLog.activity.exportCodes) ? activityLog.activity.exportCodes : '..';
      let firstInitial = activityLog.project.details.personnelID.firstName[0];
      let lastInitial = activityLog.project.details.personnelID.lastName[0];
      let initials = firstInitial + lastInitial;

      let format = "hh:mm:ss";
      time = moment(time, format);

      var beforeTime1 = moment('01:00:00', format);
      var afterTime1 = moment('11:59:59', format);

      var beforeTime2 = moment('12:00:00', format);
      var afterTime2 = moment('16:59:59', format);

      var beforeTime3 = moment('17:00:00', format);
      var afterTime3 = moment('23:59:59', format);

      if (exportLetterCode === '99999999') {
        return '99999999';
      }
      if (exportLetterCode === ('SC' || 'cwc' || 'mc')) {
        return dateCode + exportLetterCode;
        // if scheduled/reschedule return date, personnel initials, and 1 2 3 based on time 
      }
      if (activityLog.activity.name === ("Scheduled" || "Rescheduled")) {
        if (time.isBetween(beforeTime1, afterTime1)) {
          return (dateCode + initials + exportLetterCode + 1);
        }
        if (time.isBetween(beforeTime2, afterTime2)) {
          return (dateCode + initials + exportLetterCode + 2);
        }
        if (time.isBetween(beforeTime3, afterTime3)) {
          return (dateCode + initials + exportLetterCode + 3);
        }
      }
      else {
        return '';
      }
    } // buildExportCode();

    
    //PDF step #444
    const buildTableBody = (activityLogs) => {
      const buildBody = [
        [
          { text: 'Date/Time', style: 'header' },
          { text: 'Project #', style: 'header' },
          { text: 'Customer', style: 'header' },
          { text: 'Project Type', style: 'header' },
          { text: 'Activity Log Type', style: 'header' },
          { text: 'Follow Up Date', style: 'header' },
          { text: 'Export Code', style: 'header' },
        ]
      ];
      
      activityLogs.forEach((activityLog, i) => {

        let followUp = activityLog.followUp.date;
        let fupDateVar = (!followUp) ? '' : moment(followUp).format('MM-DD-YYYY');
        let PONumber = (activityLog.project.PONumber) ? activityLog.project.PONumber : 'No PO Number';
        let customerName = activityLog.project.jobID.customerID.firstName + ' ' + activityLog.project.jobID.customerID.lastName;
        let pType = (activityLog.project.projectType) ? activityLog.project.projectType : '';

        const row = [];
        row.push(moment(activityLog.activityDate).format('MM-DD-YY hh:mm A')); // Date/Time
        row.push(PONumber); // Project#
        row.push(customerName); // Cust. Name
        row.push(pType); // Proj Type
        row.push(activityLog.activity.name);  // Act Log Type
        row.push(fupDateVar); // Follow Up Date
        row.push(buildExportCode(activityLog)); // Export Code

        buildBody.push(row);
      });

      return buildBody;
    }
    
    // PDF step #333
    const buildTheReport = (activityLogs) => {
      const reportBuilder = {};
      reportBuilder.style = 'buildTheTable';
      reportBuilder.table = {};
      reportBuilder.table.widths = ['10%', 'auto', 'auto', 'auto', 'auto', 'auto', '15%'];

      reportBuilder.table.body = buildTableBody(activityLogs);

      return reportBuilder;
    }
    
    // PDF step #222
    const makeContent = (activityLogs) => {
      const content = [];
      const projectTypes = [];
      const header = {};
      const upperLeftBlock = {};


      const pTypes = [];
      reportCriteria.projectTypes.forEach((proj, i) => {
        pTypes.push(proj.name);
      })

      const actLogName = (reportCriteria.activityLogTypes.length === 1) ? reportCriteria.activityLogTypes.name : 'Multiple';

      upperLeftBlock.text = [
        moment().format('MM-DD-YYYY') + '\n',
        moment().format('h:mm A') + '\n',
        'Project Type: ' + pTypes.join(', ') + '\n',
        'Activity Log Type: ' + actLogName + '\n'
      ];

      header.text = [
        'JFI, Inc.\n',
        'Activity Log Report\n',
        'Report Date: ' + moment().format('MM-DD-YYYY') + '\n',
        moment(dateReturnObj.begin._d).format('MM/DD/YY hh:mm A')
        + ' through '
        + moment(dateReturnObj.end._d).format('MM/DD/YY hh:mm A') + '\n',
        '\n'

      ];

      upperLeftBlock.style = 'upperLeft';
      content.push(upperLeftBlock);

      header.style = "H1";
      content.push(header);

      // make the table...
      const makeTheTable = buildTheReport(activityLogs);
      content.push(makeTheTable);

      return content;

    }

    // PDF Step #111
    ActivityLogReportService.makeDocDefinition = (activityLogs) => {
      // returns a js object that defines the report
      console.log('ACTIVITYLOGS GOTTEN', activityLogs);
      return {
        pageOrientation: 'landscape',
        content: makeContent(activityLogs),
        styles: {
          header: {
            bold: true,
            color: '#000',
            fontSize: 11
          },
          lateArrivalTracking: {
            color: '#666',
            fontSize: 10
          },
          H1: {
            alignment: "center"
          },
          upperLeft: {
            alignment: "left",
            fontSize: 9
          }
        }
      };
    };
  
    
    return ActivityLogReportService;
  });