import sys
import json
import twstock
import traceback

# Monkey Patch TWSEFetcher to handle 11 columns
# The issue is that exchange returns 11 cols, but DATATUPLE expects 9.
# BaseFetcher._make_datatuple wraps the row.
# We patch it to trim the row.

try:
    # Locate the class. Usually in twstock.fetcher but imported in stock
    # Using twstock.stock.TWSEFetcher is safe as it's what Stock uses.
    FetcherClass = twstock.stock.TWSEFetcher
    
    original_make_datatuple = FetcherClass._make_datatuple
    
    def patched_make_datatuple(self, row):
        # Trim row if longer than 9
        if len(row) > 9:
            row = row[:9]
        return original_make_datatuple(self, row)
        
    FetcherClass._make_datatuple = patched_make_datatuple

except Exception as e:
    # If this fails, we can't do much, but it should work.
    pass

from twstock.analytics import BestFourPoint

def analyze_stock(code):
    try:
        # Check if code is valid
        if code not in twstock.codes:
             pass 

        stock = twstock.Stock(code)
        # Verify fetching works now
        stock.fetch_31()
        
        bfp = BestFourPoint(stock)
        analysis_result = bfp.best_four_point()
        
        output = {
            "success": True,
            "code": code,
            "name": twstock.codes[code].name if code in twstock.codes else code,
            "price": stock.price[-1] if stock.price else None,
            "message": "無顯著訊號",
            "action": "HOLD"
        }
        
        if analysis_result:
            # result is (True/False, reason)
            flag, reason = analysis_result
            output['message'] = reason
            if flag:
                output['action'] = 'BUY'
            else:
                output['action'] = 'SELL'
        
        return output

    except Exception as e:
        # traceback.print_exc()
        return {"error": str(e) + " " + traceback.format_exc(), "success": False}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No stock code provided", "success": False}))
        sys.exit(1)
        
    code = sys.argv[1]
    result = analyze_stock(code)
    print(json.dumps(result, ensure_ascii=False))
