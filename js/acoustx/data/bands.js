// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * The Acoustic X 1997 FREQUENCY BANDS tables, as the original program
 * shipped them: 1/3 octave (16 Hz … 500 Hz) and octave (16 Hz … 1 kHz)
 * rows, every field a string (database.js parses them).
 */
export const FREQ_3RD = [
  {"ID":"1","Center":"16","LowerLimit":"14.1","UpperLimit":"17.799999","dbAincrease":"56.700001","BandWidth":"3.7"},
  {"ID":"2","Center":"20","LowerLimit":"17.799999","UpperLimit":"22.4","dbAincrease":"50.5","BandWidth":"4.5999999"},
  {"ID":"3","Center":"25","LowerLimit":"22.4","UpperLimit":"28.200001","dbAincrease":"44.700001","BandWidth":"5.8000002"},
  {"ID":"4","Center":"31.5","LowerLimit":"28.200001","UpperLimit":"35.5","dbAincrease":"39.400002","BandWidth":"7.3000002"},
  {"ID":"5","Center":"40","LowerLimit":"35.5","UpperLimit":"44.700001","dbAincrease":"34.599998","BandWidth":"9.1999998"},
  {"ID":"6","Center":"50","LowerLimit":"44.700001","UpperLimit":"56.200001","dbAincrease":"30.200001","BandWidth":"11.5"},
  {"ID":"7","Center":"63","LowerLimit":"56.200001","UpperLimit":"70.699997","dbAincrease":"26.200001","BandWidth":"14.5"},
  {"ID":"8","Center":"80","LowerLimit":"70.699997","UpperLimit":"89.099998","dbAincrease":"22.5","BandWidth":"18.4"},
  {"ID":"9","Center":"100","LowerLimit":"89.099998","UpperLimit":"112","dbAincrease":"19.1","BandWidth":"22.9"},
  {"ID":"10","Center":"125","LowerLimit":"112","UpperLimit":"141","dbAincrease":"16.1","BandWidth":"29"},
  {"ID":"11","Center":"160","LowerLimit":"141","UpperLimit":"178","dbAincrease":"13.4","BandWidth":"37"},
  {"ID":"12","Center":"200","LowerLimit":"178","UpperLimit":"224","dbAincrease":"10.9","BandWidth":"46"},
  {"ID":"13","Center":"250","LowerLimit":"224","UpperLimit":"282","dbAincrease":"8.6000004","BandWidth":"58"},
  {"ID":"14","Center":"315","LowerLimit":"282","UpperLimit":"355","dbAincrease":"6.5999999","BandWidth":"73"},
  {"ID":"15","Center":"400","LowerLimit":"355","UpperLimit":"447","dbAincrease":"4.8000002","BandWidth":"92"},
  {"ID":"16","Center":"500","LowerLimit":"447","UpperLimit":"562","dbAincrease":"3.2","BandWidth":"115"},
];

export const FREQ_OCTAVE = [
  {"ID":"1","Center":"16","LowerLimit":"11","UpperLimit":"22","dBAincrease":"56.700001","BandWidth":"11"},
  {"ID":"2","Center":"31.5","LowerLimit":"22","UpperLimit":"44","dBAincrease":"39.400002","BandWidth":"22"},
  {"ID":"3","Center":"63","LowerLimit":"44","UpperLimit":"88","dBAincrease":"26.200001","BandWidth":"44"},
  {"ID":"4","Center":"125","LowerLimit":"88","UpperLimit":"177","dBAincrease":"16.1","BandWidth":"89"},
  {"ID":"5","Center":"250","LowerLimit":"177","UpperLimit":"355","dBAincrease":"8.6000004","BandWidth":"178"},
  {"ID":"6","Center":"500","LowerLimit":"355","UpperLimit":"710","dBAincrease":"3.2","BandWidth":"355"},
  {"ID":"7","Center":"1000","LowerLimit":"710","UpperLimit":"1420","dBAincrease":"0","BandWidth":"710"},
];
