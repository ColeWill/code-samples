const activityLogReportControllers = angular.module('activityLogReportControllers',[]);


activityLogReportControllers.controller('ActivityLogReportCtrl',
  // ['$scope', 'Personnel', 'ActivityLogReport', 'toastr',
      ["ActivityLogReportService",'$scope','Activities','toastr',
        
        // function($scope, Personnel, ActivityLogReport, toastr) {
        function (ActivityLogReportService, $scope, Activities, toastr) { 
            console.log(moment(new Date()));
            // Attach these variables to scope
            $scope.reportCriteria = {
                projectTypes: [
                    { name: 'Estimates', type: 'Estimate', selected: false },
                    { name: 'Installs', type: 'Install', selected: false },
                    { name: 'Repairs', type: 'Repair', selected: false },
                    // { name: 'Wrong Vendor', type: 'WrongVendor', selected: false}
                ],
                activityLogTypes: [],
                // activities: [],
                beginDate: new Date('01/01/2018'),
                beginTime: null,
                endDate: new Date('10/08/2018'),
                endTime: null
            };
          
          // sorts the contents of your array
          const sortObjectArrayByStringField = (array, field) => {

                array.sort((a, b) => {
                    if (a[field] < b[field]) {
                        return -1;
                    } else if (a[field] > b[field]) {
                        return 1;
                    } else {
                        return 0;
                    }
                });
                return array;
          };

            Activities.getActivities().then((data) => {
            
                data.forEach((el, i) => {
                    $scope.reportCriteria.activityLogTypes.push(el);
                    $scope.reportCriteria.activityLogTypes[i].selected = false;
                
                })
                console.log($scope.reportCriteria.activityLogTypes);
                $scope.reportCriteria.activityLogTypes = sortObjectArrayByStringField($scope.reportCriteria.activityLogTypes, 'name');
              
            });
           
            $scope.openPdf = () => {
                console.log('openPdf()');
                // the object from the factory
                ActivityLogReportService.getAll($scope.reportCriteria)
                    .success((reportData) => {
                        if (reportData.length == 0) {
                            toastr.info('No Records to report for selected criteria');
                        } else {
                            console.log('DATA RETURNED!');
                            
                            const docDefinition = ActivityLogReportService.makeDocDefinition(reportData);
                            pdfMake.createPdf(docDefinition).open();
                        }
                    });
            };

            $scope.showTime = () => { 
                console.log('showTime()');
                console.log($scope.reportCriteria.beginTime);
            }   

        }]);
